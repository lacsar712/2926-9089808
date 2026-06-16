const express = require('express');
const db = require('../utils/db');
const logger = require('../utils/logger');

const router = express.Router();

const CATEGORY_TO_LAYER = {
    'data-access': 'data-source',
    'data-preprocess': 'preprocess',
    'model-labeling': 'extract',
    'entity-extract': 'extract',
    'relation-build': 'relation',
    'knowledge-production': 'production',
    'data-browse': 'production'
};

const LAYER_META = {
    'data-source': { label: '数据源', color: '#3b82f6', order: 1 },
    'preprocess': { label: '预处理', color: '#10b981', order: 2 },
    'extract': { label: '抽取', color: '#f59e0b', order: 3 },
    'relation': { label: '关系', color: '#8b5cf6', order: 4 },
    'production': { label: '产出', color: '#06b6d4', order: 5 }
};

const getLatestRunStats = async (pipelineId) => {
    const rows = await db.query(
        'SELECT * FROM pipeline_run WHERE pipeline_id = ? ORDER BY start_time DESC LIMIT 1',
        [pipelineId]
    );
    if (rows.length === 0) return null;
    const runId = rows[0].id;
    const detailRows = await db.query(
        'SELECT node_id, input_count, output_count FROM node_run_detail WHERE run_id = ?',
        [runId]
    );
    const stats = {};
    detailRows.forEach(r => { stats[r.node_id] = r; });
    return { run: rows[0], stats };
};

const buildLineage = async (pipelineId) => {
    const [pipelineRows, flowRows] = await Promise.all([
        db.query('SELECT * FROM pipeline WHERE id = ? AND deleted_at IS NULL', [pipelineId]),
        db.query('SELECT flow_data FROM pipeline_flow WHERE pipeline_id = ?', [pipelineId])
    ]);
    if (pipelineRows.length === 0) {
        return { error: { code: 404, message: '生产线不存在' } };
    }
    const pipeline = pipelineRows[0];
    if (flowRows.length === 0 || !flowRows[0].flow_data) {
        return { pipeline, hasFlow: false, layers: [], nodes: [], edges: [], layersEdges: [] };
    }
    const flowData = typeof flowRows[0].flow_data === 'string' ? JSON.parse(flowRows[0].flow_data) : flowRows[0].flow_data;
    const nodes = flowData.nodes || [];
    const edges = flowData.edges || [];

    const runStats = await getLatestRunStats(pipelineId);

    const layerNodesMap = {};
    Object.keys(LAYER_META).forEach(k => { layerNodesMap[k] = []; });

    nodes.forEach(n => {
        const layer = CATEGORY_TO_LAYER[n.data?.category] || 'production';
        const stat = runStats?.stats[n.id];
        layerNodesMap[layer].push({
            id: n.id,
            label: n.data?.label || n.id,
            component: n.data?.component,
            category: n.data?.category,
            config: n.data?.config || {},
            inputCount: stat?.input_count || 0,
            outputCount: stat?.output_count || 0,
            layer
        });
    });

    const layers = Object.keys(LAYER_META)
        .filter(k => layerNodesMap[k].length > 0)
        .map(k => ({
            id: `layer-${k}`,
            key: k,
            label: LAYER_META[k].label,
            color: LAYER_META[k].color,
            order: LAYER_META[k].order,
            nodeCount: layerNodesMap[k].length,
            totalInput: layerNodesMap[k].reduce((s, n) => s + (n.inputCount || 0), 0),
            totalOutput: layerNodesMap[k].reduce((s, n) => s + (n.outputCount || 0), 0),
            nodes: layerNodesMap[k]
        }))
        .sort((a, b) => a.order - b.order);

    const layerKeySet = new Set(layers.map(l => l.key));
    const nodeLayerMap = {};
    nodes.forEach(n => { nodeLayerMap[n.id] = CATEGORY_TO_LAYER[n.data?.category] || 'production'; });

    const layerEdgeMap = {};
    const adjacency = { upstream: {}, downstream: {} };
    nodes.forEach(n => { adjacency.upstream[n.id] = []; adjacency.downstream[n.id] = []; });

    edges.forEach(e => {
        if (adjacency.downstream[e.source]) adjacency.downstream[e.source].push(e.target);
        if (adjacency.upstream[e.target]) adjacency.upstream[e.target].push(e.source);

        const srcLayer = nodeLayerMap[e.source];
        const tgtLayer = nodeLayerMap[e.target];
        if (srcLayer && tgtLayer && layerKeySet.has(srcLayer) && layerKeySet.has(tgtLayer) && srcLayer !== tgtLayer) {
            const edgeKey = `${srcLayer}->${tgtLayer}`;
            if (!layerEdgeMap[edgeKey]) {
                layerEdgeMap[edgeKey] = {
                    id: `layer-edge-${srcLayer}-${tgtLayer}`,
                    sourceLayer: srcLayer,
                    targetLayer: tgtLayer,
                    estimatedFlow: 0,
                    edgeCount: 0
                };
            }
            const srcNode = layerNodesMap[srcLayer].find(n => n.id === e.source);
            layerEdgeMap[edgeKey].estimatedFlow += (srcNode?.outputCount || 1000);
            layerEdgeMap[edgeKey].edgeCount++;
        }
    });

    const layersEdges = Object.values(layerEdgeMap).map(e => ({
        ...e,
        estimatedFlowStr: formatFlow(e.estimatedFlow)
    }));

    const nodeAdjacency = nodes.map(n => ({
        id: n.id,
        label: n.data?.label || n.id,
        component: n.data?.component,
        category: n.data?.category,
        config: n.data?.config || {},
        layer: nodeLayerMap[n.id],
        upstream: adjacency.upstream[n.id].map(uid => {
            const un = nodes.find(x => x.id === uid);
            return {
                id: uid,
                label: un?.data?.label || uid,
                component: un?.data?.component,
                layer: nodeLayerMap[uid]
            };
        }),
        downstream: adjacency.downstream[n.id].map(did => {
            const dn = nodes.find(x => x.id === did);
            return {
                id: did,
                label: dn?.data?.label || did,
                component: dn?.data?.component,
                layer: nodeLayerMap[did]
            };
        })
    }));

    return {
        pipeline: {
            id: pipeline.id,
            name: pipeline.name,
            description: pipeline.description,
            status: pipeline.status,
            version: pipeline.version,
            creator_name: pipeline.creator_name
        },
        hasFlow: nodes.length > 0 && edges.length > 0,
        layers,
        nodes: nodeAdjacency,
        edges: layersEdges,
        latestRun: runStats?.run
    };
};

const formatFlow = (num) => {
    if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toString();
};

router.get('/:pipelineId', async (req, res) => {
    try {
        const result = await buildLineage(req.params.pipelineId);
        if (result.error) {
            return res.status(result.error.code).json({ success: false, message: result.error.message });
        }
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Get lineage error:', { message: error.message, stack: error.stack });
        res.status(500).json({ success: false, message: '获取血缘数据失败' });
    }
});

router.post('/compare', async (req, res) => {
    try {
        const { pipelineId1, pipelineId2 } = req.body;
        if (!pipelineId1 || !pipelineId2) {
            return res.status(400).json({ success: false, message: '请选择两条生产线' });
        }
        const [lineage1, lineage2] = await Promise.all([
            buildLineage(pipelineId1),
            buildLineage(pipelineId2)
        ]);
        if (lineage1.error) return res.status(lineage1.error.code).json({ success: false, message: lineage1.error.message });
        if (lineage2.error) return res.status(lineage2.error.code).json({ success: false, message: lineage2.error.message });

        const diff = {
            layers: compareLayers(lineage1.layers, lineage2.layers),
            components: compareComponents(lineage1.nodes, lineage2.nodes)
        };

        res.json({
            success: true,
            data: {
                lineage1: markDiff(lineage1, diff, 'left'),
                lineage2: markDiff(lineage2, diff, 'right'),
                diff
            }
        });
    } catch (error) {
        logger.error('Compare lineage error:', { message: error.message, stack: error.stack });
        res.status(500).json({ success: false, message: '对比失败' });
    }
});

const compareLayers = (layers1, layers2) => {
    const keys1 = new Set(layers1.map(l => l.key));
    const keys2 = new Set(layers2.map(l => l.key));
    const allKeys = new Set([...keys1, ...keys2]);
    const result = {};
    allKeys.forEach(k => {
        const in1 = keys1.has(k);
        const in2 = keys2.has(k);
        if (in1 && !in2) result[k] = 'only-left';
        else if (!in1 && in2) result[k] = 'only-right';
        else {
            const l1 = layers1.find(x => x.key === k);
            const l2 = layers2.find(x => x.key === k);
            result[k] = l1.nodeCount !== l2.nodeCount ? 'count-diff' : 'same';
        }
    });
    return result;
};

const compareComponents = (nodes1, nodes2) => {
    const compSet1 = new Set(nodes1.map(n => `${n.component}:${n.label}`));
    const compSet2 = new Set(nodes2.map(n => `${n.component}:${n.label}`));
    return {
        onlyLeft: [...compSet1].filter(x => !compSet2.has(x)),
        onlyRight: [...compSet2].filter(x => !compSet1.has(x)),
        common: [...compSet1].filter(x => compSet2.has(x))
    };
};

const markDiff = (lineage, diff, side) => {
    const marked = JSON.parse(JSON.stringify(lineage));
    const compKeys = side === 'left' ? diff.components.onlyLeft : diff.components.onlyRight;
    const compSet = new Set(compKeys);
    marked.layers.forEach(layer => {
        layer.diffType = diff.layers[layer.key] || 'same';
        layer.nodes.forEach(n => {
            const key = `${n.component}:${n.label}`;
            if (compSet.has(key)) n.diffType = side === 'left' ? 'only-left' : 'only-right';
            else n.diffType = 'same';
        });
    });
    return marked;
};

module.exports = router;
