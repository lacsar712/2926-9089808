const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/utils/db');
const { JWT_SECRET } = require('../src/middleware/auth');

const ADMIN_USER = { id: 1, username: 'admin', role: 'admin', nickname: '系统管理员' };
const EDITOR_USER = { id: 2, username: 'zhangsan', role: 'editor', nickname: '张三' };

const generateToken = (user) => {
    return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
};

const adminToken = generateToken(ADMIN_USER);
const editorToken = generateToken(EDITOR_USER);

describe('Flow Routes Integration Tests', () => {
    let testPipelineId;
    let testPipelineIdEmptyFlow;
    let testPipelineIdIsolatedNodes;
    let testPipelineIdValidFlow;
    let testPipelineIdForHistory;

    const EMPTY_FLOW_DATA = { nodes: [], edges: [] };
    const ISOLATED_NODES_FLOW_DATA = {
        nodes: [
            { id: 'node-1', type: 'custom', position: { x: 80, y: 200 }, data: { label: '数据读取', component: 'database-reader' } },
            { id: 'node-2', type: 'custom', position: { x: 350, y: 200 }, data: { label: '数据清洗', component: 'data-cleaner' } }
        ],
        edges: []
    };
    const VALID_FLOW_DATA = {
        nodes: [
            { id: 'node-1', type: 'custom', position: { x: 80, y: 200 }, data: { label: '数据读取', component: 'database-reader' } },
            { id: 'node-2', type: 'custom', position: { x: 350, y: 200 }, data: { label: '数据清洗', component: 'data-cleaner' } },
            { id: 'node-3', type: 'custom', position: { x: 620, y: 200 }, data: { label: '数据输出', component: 'data-writer' } }
        ],
        edges: [
            { id: 'e1-2', source: 'node-1', target: 'node-2', animated: true },
            { id: 'e2-3', source: 'node-2', target: 'node-3', animated: true }
        ]
    };

    beforeAll(async () => {
        const baseEnv = process.env;
        process.env.DB_HOST = baseEnv.DB_HOST || 'localhost';
        process.env.DB_PORT = baseEnv.DB_PORT || '3306';
        process.env.DB_USER = baseEnv.DB_USER || 'pipeline_user';
        process.env.DB_PASSWORD = baseEnv.DB_PASSWORD || 'pipeline_pass_2024';
        process.env.DB_NAME = baseEnv.DB_NAME || 'data_pipeline';

        const result = await db.query(
            'INSERT INTO pipeline (name, description, creator_id, environment, status, version) VALUES (?, ?, ?, ?, ?, ?)',
            ['Test Pipeline - Flow Check', 'For flow check integration test', ADMIN_USER.id, 'development', 'draft', 1]
        );
        testPipelineId = result.insertId;

        const resultEmpty = await db.query(
            'INSERT INTO pipeline (name, description, creator_id, environment, status, version) VALUES (?, ?, ?, ?, ?, ?)',
            ['Test Pipeline - Empty Flow', 'For empty flow check test', ADMIN_USER.id, 'development', 'draft', 1]
        );
        testPipelineIdEmptyFlow = resultEmpty.insertId;
        await db.query(
            'INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)',
            [testPipelineIdEmptyFlow, JSON.stringify(EMPTY_FLOW_DATA)]
        );

        const resultIsolated = await db.query(
            'INSERT INTO pipeline (name, description, creator_id, environment, status, version) VALUES (?, ?, ?, ?, ?, ?)',
            ['Test Pipeline - Isolated Nodes', 'For isolated nodes check test', ADMIN_USER.id, 'development', 'draft', 1]
        );
        testPipelineIdIsolatedNodes = resultIsolated.insertId;
        await db.query(
            'INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)',
            [testPipelineIdIsolatedNodes, JSON.stringify(ISOLATED_NODES_FLOW_DATA)]
        );

        const resultValid = await db.query(
            'INSERT INTO pipeline (name, description, creator_id, environment, status, version) VALUES (?, ?, ?, ?, ?, ?)',
            ['Test Pipeline - Valid Flow', 'For valid flow check and publish test', ADMIN_USER.id, 'development', 'draft', 1]
        );
        testPipelineIdValidFlow = resultValid.insertId;
        await db.query(
            'INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)',
            [testPipelineIdValidFlow, JSON.stringify(VALID_FLOW_DATA)]
        );

        const resultHistory = await db.query(
            'INSERT INTO pipeline (name, description, creator_id, environment, status, version) VALUES (?, ?, ?, ?, ?, ?)',
            ['Test Pipeline - History Check', 'For pipeline history check test', ADMIN_USER.id, 'development', 'draft', 5]
        );
        testPipelineIdForHistory = resultHistory.insertId;
        await db.query(
            'INSERT INTO pipeline_flow (pipeline_id, flow_data) VALUES (?, ?)',
            [testPipelineIdForHistory, JSON.stringify(VALID_FLOW_DATA)]
        );
    });

    afterAll(async () => {
        const pipelineIds = [testPipelineId, testPipelineIdEmptyFlow, testPipelineIdIsolatedNodes, testPipelineIdValidFlow, testPipelineIdForHistory];
        const placeholders = pipelineIds.map(() => '?').join(',');

        await db.query(`DELETE FROM operation_log WHERE target IN (SELECT name FROM pipeline WHERE id IN (${placeholders}))`, pipelineIds);
        await db.query(`DELETE FROM pipeline_history WHERE pipeline_id IN (${placeholders})`, pipelineIds);
        await db.query(`DELETE FROM pipeline_flow WHERE pipeline_id IN (${placeholders})`, pipelineIds);
        await db.query(`DELETE FROM pipeline_tag WHERE pipeline_id IN (${placeholders})`, pipelineIds);
        await db.query(`DELETE FROM pipeline WHERE id IN (${placeholders})`, pipelineIds);

        await db.pool.end();
    });

    describe('POST /api/flows/:pipelineId/check - 编排合法性检查', () => {
        it('should return valid=false when pipeline_flow does not exist (empty canvas)', async () => {
            const res = await request(app)
                .post(`/api/flows/${testPipelineId}/check`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.valid).toBe(false);
            expect(res.body.data.errors).toContain('编排数据为空');
        });

        it('should return valid=false when flow has no nodes and no edges (empty canvas data)', async () => {
            const res = await request(app)
                .post(`/api/flows/${testPipelineIdEmptyFlow}/check`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.valid).toBe(false);
            expect(res.body.data.errors).toContain('画布中没有任何组件');
            expect(res.body.data.errors).toContain('组件之间没有连线');
        });

        it('should return valid=false when flow has nodes but no edges (isolated nodes)', async () => {
            const res = await request(app)
                .post(`/api/flows/${testPipelineIdIsolatedNodes}/check`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.valid).toBe(false);
            expect(res.body.data.errors).toContain('组件之间没有连线');
            expect(res.body.data.errors).toContain('组件"数据读取"未连接');
            expect(res.body.data.errors).toContain('组件"数据清洗"未连接');
        });

        it('should return valid=true when flow has nodes and all nodes are connected', async () => {
            const res = await request(app)
                .post(`/api/flows/${testPipelineIdValidFlow}/check`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.valid).toBe(true);
            expect(res.body.data.errors).toEqual([]);
        });

        it('should return 404 when pipeline does not exist', async () => {
            const res = await request(app)
                .post('/api/flows/99999/check')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development');

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('生产线不存在');
        });
    });

    describe('POST /api/flows/:pipelineId/publish - 发布生产线', () => {
        it('should increment pipeline.version after publish', async () => {
            const beforeRows = await db.query(
                'SELECT version FROM pipeline WHERE id = ?',
                [testPipelineIdValidFlow]
            );
            const beforeVersion = beforeRows[0].version;

            const res = await request(app)
                .post(`/api/flows/${testPipelineIdValidFlow}/publish`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development')
                .send({ remark: 'Integration test publish' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain(`发布成功，当前版本 v${beforeVersion + 1}`);

            const afterRows = await db.query(
                'SELECT version, status FROM pipeline WHERE id = ?',
                [testPipelineIdValidFlow]
            );
            expect(afterRows[0].version).toBe(beforeVersion + 1);
            expect(afterRows[0].status).toBe('published');
        });

        it('should write correct pipeline_history record after publish', async () => {
            const pipelineRows = await db.query(
                'SELECT version FROM pipeline WHERE id = ?',
                [testPipelineIdForHistory]
            );
            const currentVersion = pipelineRows[0].version;

            const beforeHistoryRows = await db.query(
                'SELECT COUNT(*) as count FROM pipeline_history WHERE pipeline_id = ?',
                [testPipelineIdForHistory]
            );
            const beforeCount = beforeHistoryRows[0].count;

            const publishRemark = `Integration test publish v${currentVersion + 1}`;
            const res = await request(app)
                .post(`/api/flows/${testPipelineIdForHistory}/publish`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development')
                .send({ remark: publishRemark });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain(`发布成功，当前版本 v${currentVersion + 1}`);

            const afterPipelineRows = await db.query(
                'SELECT version, status FROM pipeline WHERE id = ?',
                [testPipelineIdForHistory]
            );
            expect(afterPipelineRows[0].version).toBe(currentVersion + 1);
            expect(afterPipelineRows[0].status).toBe('published');

            const afterHistoryRows = await db.query(
                'SELECT * FROM pipeline_history WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT 1',
                [testPipelineIdForHistory]
            );
            expect(afterHistoryRows.length).toBe(1);

            const historyRecord = afterHistoryRows[0];
            expect(historyRecord.pipeline_id).toBe(testPipelineIdForHistory);
            expect(historyRecord.version).toBe(currentVersion + 1);
            expect(historyRecord.operator).toBe(ADMIN_USER.username);
            expect(historyRecord.action).toBe('publish');
            expect(historyRecord.remark).toBe(publishRemark);

            const savedFlowData = typeof historyRecord.flow_data === 'string'
                ? JSON.parse(historyRecord.flow_data)
                : historyRecord.flow_data;
            expect(savedFlowData.nodes).toHaveLength(VALID_FLOW_DATA.nodes.length);
            expect(savedFlowData.edges).toHaveLength(VALID_FLOW_DATA.edges.length);
            expect(savedFlowData.nodes[0].id).toBe(VALID_FLOW_DATA.nodes[0].id);
            expect(savedFlowData.edges[0].source).toBe(VALID_FLOW_DATA.edges[0].source);

            const afterCountRows = await db.query(
                'SELECT COUNT(*) as count FROM pipeline_history WHERE pipeline_id = ?',
                [testPipelineIdForHistory]
            );
            expect(afterCountRows[0].count).toBe(beforeCount + 1);
        });

        it('should return 400 when publishing without flow data', async () => {
            const res = await request(app)
                .post(`/api/flows/${testPipelineId}/publish`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development')
                .send({ remark: 'Publish without flow' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('请先编排生产线');
        });

        it('should return 403 when non-admin user tries to publish', async () => {
            const res = await request(app)
                .post(`/api/flows/${testPipelineIdValidFlow}/publish`)
                .set('Authorization', `Bearer ${editorToken}`)
                .set('X-Environment', 'development')
                .send({ remark: 'Editor trying to publish' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('权限不足，无法执行此操作');
        });

        it('should return 404 when publishing non-existent pipeline', async () => {
            const res = await request(app)
                .post('/api/flows/99999/publish')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Environment', 'development')
                .send({ remark: 'Publish non-existent' });

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('生产线不存在');
        });
    });
});
