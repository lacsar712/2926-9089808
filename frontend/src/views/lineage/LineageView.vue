<template>
  <div class="lineage-page">
    <aside class="pipeline-panel">
      <div class="panel-header">
        <h3>生产线选择</h3>
        <el-switch
          v-model="compareMode"
          active-text="对比"
          inactive-text="单条"
          @change="onCompareModeChange"
        />
      </div>
      <div class="filter-area">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索生产线..."
          clearable
          prefix-icon="Search"
          size="small"
        />
        <el-select
          v-model="statusFilter"
          placeholder="状态筛选"
          clearable
          size="small"
          style="width: 100%; margin-top: 8px"
        >
          <el-option label="草稿" value="draft" />
          <el-option label="已发布" value="published" />
          <el-option label="运行中" value="running" />
          <el-option label="已停止" value="stopped" />
          <el-option label="错误" value="error" />
        </el-select>
      </div>
      <div class="pipeline-list">
        <div
          v-for="p in filteredPipelines"
          :key="p.id"
          class="pipeline-item"
          :class="{
            selected: !compareMode && selectedPipelineId === p.id,
            'selected-left': compareMode && comparePipelineIds[0] === p.id,
            'selected-right': compareMode && comparePipelineIds[1] === p.id
          }"
          @click="selectPipeline(p)"
        >
          <div class="pipeline-title">
            <span class="pipeline-name">{{ p.name }}</span>
            <el-tag size="small" :type="statusTagType(p.status)" effect="dark">
              {{ statusLabel(p.status) }}
            </el-tag>
          </div>
          <p class="pipeline-desc">{{ p.description || '暂无描述' }}</p>
          <div class="pipeline-meta">
            <span v-if="!compareMode && selectedPipelineId === p.id">
              <el-icon><Check /></el-icon> 已选
            </span>
            <span v-else-if="compareMode && comparePipelineIds[0] === p.id">
              <el-icon><Aim /></el-icon> 对比A
            </span>
            <span v-else-if="compareMode && comparePipelineIds[1] === p.id">
              <el-icon><Aim /></el-icon> 对比B
            </span>
            <span class="version">v{{ p.version }}</span>
          </div>
        </div>
        <el-empty v-if="!loading && filteredPipelines.length === 0" description="暂无生产线" :image-size="80" />
      </div>
    </aside>

    <div class="graph-area">
      <div class="graph-header">
        <div class="header-left">
          <template v-if="!compareMode && lineageData">
            <span class="graph-title">
              {{ lineageData.pipeline?.name || '请选择生产线' }}
            </span>
            <el-tag
              v-if="lineageData.pipeline?.status"
              size="small"
              :type="statusTagType(lineageData.pipeline.status)"
              effect="plain"
              style="margin-left: 8px"
            >
              {{ statusLabel(lineageData.pipeline.status) }}
            </el-tag>
          </template>
          <template v-if="compareMode">
            <span class="graph-title">血缘对比</span>
            <span v-if="compareResult" class="compare-legend">
              <span class="legend-item">
                <span class="legend-dot" style="background: #3b82f6"></span>
                生产线A
              </span>
              <span class="legend-item">
                <span class="legend-dot" style="background: #10b981"></span>
                生产线B
              </span>
              <span class="legend-item">
                <span class="legend-dot" style="background: #f59e0b"></span>
                差异
              </span>
            </span>
          </template>
        </div>
      </div>

      <div class="graph-content" v-loading="loading">
        <div v-if="!loading && hasData" class="graph-main">
          <div class="graph-single" v-if="!compareMode">
            <div ref="echartsRef" class="echarts-container" />
          </div>
          <div v-else class="graph-compare">
            <div class="compare-col">
              <div class="compare-col-header">
                <span>A: {{ compareResult?.lineage1?.pipeline?.name || '-' }}</span>
              </div>
              <div ref="echartsRef1" class="echarts-container" />
            </div>
            <div class="compare-col">
              <div class="compare-col-header">
                <span>B: {{ compareResult?.lineage2?.pipeline?.name || '-' }}</span>
              </div>
              <div ref="echartsRef2" class="echarts-container" />
            </div>
          </div>
        </div>

        <div v-else-if="!loading && !hasData" class="empty-guide">
          <el-empty :image-size="120">
            <template #description>
              <div class="empty-tips">
                <p v-if="compareMode && comparePipelineIds.filter(Boolean).length < 2">
                  请选择两条生产线进行对比
                </p>
                <p v-else-if="!compareMode && !selectedPipelineId">
                  请从左侧选择一条生产线查看血缘
                </p>
                <p v-else-if="lineageData && !lineageData.hasFlow">
                  该生产线暂无编排数据
                </p>
                <p v-else-if="compareResult && (!compareResult.lineage1?.hasFlow || !compareResult.lineage2?.hasFlow)">
                  所选生产线暂无编排数据，无法对比
                </p>
                <div v-if="(lineageData && !lineageData.hasFlow) || (compareResult && (!compareResult.lineage1?.hasFlow || !compareResult.lineage2?.hasFlow))" class="empty-actions">
                  <el-button type="primary" @click="goToFlow">
                    <el-icon><Edit /></el-icon>
                    前往编排
                  </el-button>
                </div>
              </div>
            </template>
          </el-empty>
        </div>
      </div>
    </div>

    <el-drawer
      v-model="detailDrawerVisible"
      :title="selectedLayer ? `${selectedLayer.label} - 组件详情` : '组件详情'"
      size="420px"
      direction="rtl"
    >
      <div v-if="selectedLayer" class="drawer-content">
        <div class="layer-summary">
          <div class="summary-item">
            <span class="summary-label">组件数量</span>
            <span class="summary-value">{{ selectedLayer.nodeCount }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">总输入</span>
            <span class="summary-value">{{ formatNumber(selectedLayer.totalInput) }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">总输出</span>
            <span class="summary-value">{{ formatNumber(selectedLayer.totalOutput) }}</span>
          </div>
        </div>

        <el-divider />

        <div class="component-list">
          <el-collapse v-model="activeNodeIds">
            <el-collapse-item
              v-for="node in selectedLayer.nodes"
              :key="node.id"
              :name="node.id"
            >
              <template #title>
                <div class="collapse-title" :class="{ 'diff-only-left': node.diffType === 'only-left', 'diff-only-right': node.diffType === 'only-right' }">
                  <el-icon><Cpu /></el-icon>
                  <span class="node-label">{{ node.label }}</span>
                  <el-tag
                    size="small"
                    effect="plain"
                    style="margin-left: auto"
                  >
                    {{ node.component }}
                  </el-tag>
                  <el-tag
                    v-if="node.diffType === 'only-left'"
                    size="small"
                    type="primary"
                    effect="dark"
                    style="margin-left: 6px"
                  >
                    仅A
                  </el-tag>
                  <el-tag
                    v-else-if="node.diffType === 'only-right'"
                    size="small"
                    type="success"
                    effect="dark"
                    style="margin-left: 6px"
                  >
                    仅B
                  </el-tag>
                </div>
              </template>
              <div class="node-detail">
                <div class="detail-section">
                  <div class="detail-label">上下游关系</div>
                  <div class="relation-block">
                    <div class="relation-col">
                      <div class="relation-title">
                        <el-icon><ArrowUp /></el-icon>
                        上游 ({{ node.upstream?.length || 0 }})
                      </div>
                      <div v-if="node.upstream?.length" class="relation-list">
                        <div
                          v-for="u in node.upstream"
                          :key="u.id"
                          class="relation-item upstream"
                        >
                          <el-icon><CircleCheck /></el-icon>
                          <span>{{ u.label }}</span>
                        </div>
                      </div>
                      <el-empty v-else description="无上游" :image-size="40" />
                    </div>
                    <div class="relation-col">
                      <div class="relation-title">
                        <el-icon><ArrowDown /></el-icon>
                        下游 ({{ node.downstream?.length || 0 }})
                      </div>
                      <div v-if="node.downstream?.length" class="relation-list">
                        <div
                          v-for="d in node.downstream"
                          :key="d.id"
                          class="relation-item downstream"
                        >
                          <el-icon><CircleCheck /></el-icon>
                          <span>{{ d.label }}</span>
                        </div>
                      </div>
                      <el-empty v-else description="无下游" :image-size="40" />
                    </div>
                  </div>
                </div>

                <el-divider />

                <div class="detail-section">
                  <div class="detail-label">配置摘要</div>
                  <div class="config-summary">
                    <el-descriptions :column="1" border size="small">
                      <template
                        v-for="(value, key) in node.config"
                        :key="key"
                      >
                        <el-descriptions-item :label="configLabel(key)">
                          <template v-if="typeof value === 'boolean'">
                            {{ value ? '是' : '否' }}
                          </template>
                          <template v-else-if="Array.isArray(value)">
                            <el-tag
                              v-for="(v, i) in value"
                              :key="i"
                              size="small"
                              style="margin-right: 4px; margin-bottom: 4px"
                            >
                              {{ v }}
                            </el-tag>
                          </template>
                          <template v-else>
                            {{ typeof value === 'object' ? JSON.stringify(value) : value }}
                          </template>
                        </el-descriptions-item>
                      </template>
                    </el-descriptions>
                  </div>
                </div>

                <div class="detail-section" v-if="node.inputCount || node.outputCount">
                  <el-divider />
                  <div class="detail-label">数据统计</div>
                  <div class="stats-row">
                    <div class="stat-item">
                      <span class="stat-label">输入量</span>
                      <span class="stat-value">{{ formatNumber(node.inputCount) }}</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-label">输出量</span>
                      <span class="stat-value">{{ formatNumber(node.outputCount) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import api from '@/utils/request'

const router = useRouter()

const searchKeyword = ref('')
const statusFilter = ref('')
const pipelines = ref([])
const loading = ref(false)
const selectedPipelineId = ref(null)
const lineageData = ref(null)

const compareMode = ref(false)
const comparePipelineIds = reactive([null, null])
const compareResult = ref(null)

const selectedLayer = ref(null)
const detailDrawerVisible = ref(false)
const activeNodeIds = ref([])

const echartsRef = ref(null)
const echartsRef1 = ref(null)
const echartsRef2 = ref(null)
let chartInstance = null
let chartInstance1 = null
let chartInstance2 = null

const statusLabel = (s) => ({
  draft: '草稿', published: '已发布', running: '运行中', stopped: '已停止', error: '错误'
}[s] || s)

const statusTagType = (s) => ({
  draft: 'info', published: 'success', running: 'primary', stopped: 'warning', error: 'danger'
}[s] || 'info')

const formatNumber = (n) => {
  if (!n) return '0'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toString()
}

const configLabels = {
  host: '服务器地址', port: '端口', database: '数据库名', table: '表名',
  url: 'API地址', method: '请求方法', interval: '采集间隔', format: '数据格式',
  path: '文件路径', encoding: '编码', batchSize: '批次大小',
  brokers: 'Broker地址', topic: '主题', groupId: '消费组',
  username: '用户名', remotePath: '远程路径',
  removeNull: '移除空值', removeDuplicate: '去重', trimWhitespace: '去除空白',
  lowercase: '转小写', removeSpecialChars: '去特殊字符',
  conditions: '过滤条件', mode: '过滤模式',
  maxLength: '最大长度', overlap: '重叠长度',
  inputFormat: '输入格式', outputFormat: '输出格式', dateFormat: '日期格式',
  model: '模型名称', modelPath: '模型路径', entityTypes: '实体类型',
  confidence: '置信度阈值', labels: '标签列表', categories: '分类列表',
  threshold: '阈值', rules: '规则列表', fieldName: '字段名',
  caseSensitive: '区分大小写', level: '解析级别', includeCoords: '包含坐标',
  relationTypes: '关系类型', windowSize: '窗口大小', minFrequency: '最小频率',
  eventTypes: '事件类型', extractArgs: '提取参数',
  graphDB: '图数据库', target: '目标存储', index: '索引名',
  strategy: '融合策略', sources: '数据源数', conflictResolution: '冲突处理',
  strictMode: '严格模式', maxNodes: '最大节点数', layout: '布局方式',
  refreshInterval: '刷新间隔(秒)', chartTypes: '图表类型',
  maxRows: '最大行数', template: '模板', includeCharts: '包含图表',
  inputField: '输入字段', outputField: '输出字段'
}
const configLabel = (k) => configLabels[k] || k

const filteredPipelines = computed(() => {
  let list = pipelines.value
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      (p.description || '').toLowerCase().includes(kw)
    )
  }
  if (statusFilter.value) {
    list = list.filter(p => p.status === statusFilter.value)
  }
  return list
})

const hasData = computed(() => {
  if (compareMode.value) {
    return !!(compareResult.value && compareResult.value.lineage1?.hasFlow && compareResult.value.lineage2?.hasFlow)
  }
  return !!(lineageData.value && lineageData.value.hasFlow)
})

const loadPipelines = async () => {
  try {
    const res = await api.get('/pipelines', { params: { pageSize: 100 } })
    pipelines.value = res.data?.list || []
  } catch (e) { /* handled */ }
}

const selectPipeline = (p) => {
  if (compareMode.value) {
    if (comparePipelineIds[0] === p.id) {
      comparePipelineIds[0] = null
    } else if (comparePipelineIds[1] === p.id) {
      comparePipelineIds[1] = null
    } else if (!comparePipelineIds[0]) {
      comparePipelineIds[0] = p.id
    } else if (!comparePipelineIds[1]) {
      comparePipelineIds[1] = p.id
    } else {
      comparePipelineIds[0] = p.id
      comparePipelineIds[1] = null
    }
    loadCompareData()
  } else {
    selectedPipelineId.value = p.id
    loadLineageData()
  }
}

const onCompareModeChange = () => {
  comparePipelineIds[0] = null
  comparePipelineIds[1] = null
  selectedPipelineId.value = null
  lineageData.value = null
  compareResult.value = null
  disposeCharts()
}

const loadLineageData = async () => {
  if (!selectedPipelineId.value) {
    lineageData.value = null
    disposeCharts()
    return
  }
  loading.value = true
  try {
    const res = await api.get(`/lineage/${selectedPipelineId.value}`)
    lineageData.value = res.data
    await nextTick()
    renderChart()
  } catch (e) {
    lineageData.value = null
  } finally {
    loading.value = false
  }
}

const loadCompareData = async () => {
  if (!comparePipelineIds[0] || !comparePipelineIds[1]) {
    compareResult.value = null
    disposeCharts()
    return
  }
  loading.value = true
  try {
    const res = await api.post('/lineage/compare', {
      pipelineId1: comparePipelineIds[0],
      pipelineId2: comparePipelineIds[1]
    })
    compareResult.value = res.data
    await nextTick()
    renderCompareCharts()
  } catch (e) {
    compareResult.value = null
  } finally {
    loading.value = false
  }
}

const goToFlow = () => {
  const id = compareMode.value ? comparePipelineIds[0] || comparePipelineIds[1] : selectedPipelineId.value
  if (id) router.push(`/pipeline/flow/${id}`)
}

const buildChartOption = (lineage, compareSide = null) => {
  if (!lineage || !lineage.layers?.length) return {}
  const layers = lineage.layers
  const layerIdxMap = {}
  layers.forEach((l, i) => { layerIdxMap[l.key] = i })

  const colWidth = 250
  const paddingX = 100
  const paddingY = 120

  const nodes = []
  layers.forEach((layer, colIdx) => {
    const rowCount = layer.nodes.length
    layer.nodes.forEach((node, rowIdx) => {
      const yOffset = rowCount === 1 ? 0 : (rowIdx - (rowCount - 1) / 2) * 90
      const x = paddingX + colIdx * colWidth
      const y = paddingY + 180 + yOffset
      let color = layer.color
      let borderColor = layer.color
      if (compareSide && node.diffType) {
        if (node.diffType === 'only-left') { color = '#3b82f6'; borderColor = '#3b82f6' }
        else if (node.diffType === 'only-right') { color = '#10b981'; borderColor = '#10b981' }
      }
      nodes.push({
        id: node.id,
        name: node.label,
        category: colIdx,
        x,
        y,
        symbol: 'roundRect',
        symbolSize: [160, 48],
        itemStyle: {
          color: color + '33',
          borderColor,
          borderWidth: 2,
          borderRadius: 8
        },
        label: {
          show: true,
          position: 'inside',
          formatter: node.label,
          fontSize: 12,
          color: '#e2e8f0',
          overflow: 'truncate',
          width: 140
        },
        _layerKey: layer.key,
        _node: node,
        _layer: layer
      })
    })
  })

  const layerNodes = layers.map((layer, colIdx) => ({
    id: layer.id,
    name: layer.label,
    category: colIdx,
    x: paddingX + colIdx * colWidth,
    y: 60,
    symbol: 'roundRect',
    symbolSize: [180, 56],
    itemStyle: {
      color: layer.color,
      borderColor: layer.color,
      borderWidth: 0,
      borderRadius: 10
    },
    label: {
      show: true,
      position: 'inside',
      formatter: `{layer|${layer.label}}\n{cnt|${layer.nodeCount}个组件}`,
      rich: {
        layer: { fontSize: 14, fontWeight: 'bold', color: '#fff', lineHeight: 22 },
        cnt: { fontSize: 11, color: '#ffffffcc', lineHeight: 18 }
      }
    },
    _isLayer: true,
    _layer: layer
  }))

  const allNodes = [...layerNodes, ...nodes]

  const edges = []
  lineage.edges?.forEach(e => {
    const srcIdx = layerIdxMap[e.sourceLayer]
    const tgtIdx = layerIdxMap[e.targetLayer]
    if (srcIdx === undefined || tgtIdx === undefined) return
    edges.push({
      source: `layer-${e.sourceLayer}`,
      target: `layer-${e.targetLayer}`,
      lineStyle: {
        color: layers[tgtIdx]?.color || '#818cf8',
        width: Math.min(6, Math.max(2, Math.log10(e.estimatedFlow || 1) * 1.2)),
        opacity: 0.6,
        curveness: 0.2
      },
      label: {
        show: true,
        formatter: e.estimatedFlowStr,
        fontSize: 11,
        color: '#94a3b8',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: [4, 8],
        borderRadius: 4
      },
      _edge: e
    })
  })

  lineage.nodes?.forEach(n => {
    (n.downstream || []).forEach(d => {
      const srcNode = nodes.find(x => x.id === n.id)
      const tgtNode = nodes.find(x => x.id === d.id)
      if (srcNode && tgtNode && srcNode.category !== tgtNode.category) {
        edges.push({
          source: n.id,
          target: d.id,
          lineStyle: {
            color: layers[tgtNode.category]?.color || '#6366f1',
            width: 1.5,
            opacity: 0.3,
            type: 'dashed',
            curveness: 0.3
          }
        })
      }
    })
  })

  return {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: '#334155',
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (params) => {
        if (params.dataType === 'node') {
          if (params.data._isLayer) {
            const l = params.data._layer
            return `<b style="color:${l.color}">${l.label}</b><br/>组件数: ${l.nodeCount}<br/>总输入: ${formatNumber(l.totalInput)}<br/>总输出: ${formatNumber(l.totalOutput)}`
          } else {
            const n = params.data._node
            return `<b>${n.label}</b><br/>类型: ${n.component}<br/>输入: ${formatNumber(n.inputCount)}<br/>输出: ${formatNumber(n.outputCount)}`
          }
        } else if (params.dataType === 'edge') {
          const e = params.data._edge
          if (e) return `流量估算: <b>${e.estimatedFlowStr}</b><br/>连接数: ${e.edgeCount}条`
          return ''
        }
        return ''
      }
    },
    animationDuration: 500,
    series: [{
      type: 'graph',
      layout: 'none',
      roam: true,
      draggable: false,
      data: allNodes,
      links: edges,
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 4 }
      },
      lineStyle: { curveness: 0.2 },
      label: { show: true },
      force: { repulsion: 0 }
    }]
  }
}

const renderChart = () => {
  if (!echartsRef.value || !lineageData.value) return
  disposeCharts()
  chartInstance = echarts.init(echartsRef.value)
  chartInstance.setOption(buildChartOption(lineageData.value))
  chartInstance.on('click', (params) => {
    if (params.dataType === 'node' && params.data._layer) {
      selectedLayer.value = params.data._layer
      detailDrawerVisible.value = true
      activeNodeIds.value = []
    }
  })
  window.addEventListener('resize', handleResize)
}

const renderCompareCharts = () => {
  if (!echartsRef1.value || !echartsRef2.value || !compareResult.value) return
  disposeCharts()
  chartInstance1 = echarts.init(echartsRef1.value)
  chartInstance1.setOption(buildChartOption(compareResult.value.lineage1, 'left'))
  chartInstance1.on('click', (params) => {
    if (params.dataType === 'node' && params.data._layer) {
      selectedLayer.value = params.data._layer
      detailDrawerVisible.value = true
      activeNodeIds.value = []
    }
  })
  chartInstance2 = echarts.init(echartsRef2.value)
  chartInstance2.setOption(buildChartOption(compareResult.value.lineage2, 'right'))
  chartInstance2.on('click', (params) => {
    if (params.dataType === 'node' && params.data._layer) {
      selectedLayer.value = params.data._layer
      detailDrawerVisible.value = true
      activeNodeIds.value = []
    }
  })
  window.addEventListener('resize', handleResize)
}

const handleResize = () => {
  chartInstance?.resize()
  chartInstance1?.resize()
  chartInstance2?.resize()
}

const disposeCharts = () => {
  chartInstance?.dispose()
  chartInstance1?.dispose()
  chartInstance2?.dispose()
  chartInstance = null
  chartInstance1 = null
  chartInstance2 = null
  window.removeEventListener('resize', handleResize)
}

watch(compareMode, () => {
  nextTick(() => {
    if (compareMode.value) renderCompareCharts()
    else renderChart()
  })
})

onMounted(() => {
  loadPipelines()
})

onUnmounted(() => {
  disposeCharts()
})
</script>

<style scoped>
.lineage-page {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--gradient-bg);
}

.pipeline-panel {
  width: 280px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.panel-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.filter-area {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.pipeline-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.pipeline-item {
  padding: 12px;
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  cursor: pointer;
  transition: var(--transition);
  border: 1px solid transparent;
}

.pipeline-item:hover {
  background: var(--bg-hover);
}

.pipeline-item.selected {
  background: rgba(99, 102, 241, 0.12);
  border-color: var(--primary);
}

.pipeline-item.selected-left {
  background: rgba(59, 130, 246, 0.12);
  border-color: #3b82f6;
}

.pipeline-item.selected-right {
  background: rgba(16, 185, 129, 0.12);
  border-color: #10b981;
}

.pipeline-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.pipeline-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.pipeline-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.pipeline-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}

.pipeline-meta > span:first-child {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--primary);
}

.version {
  font-family: 'Monaco', monospace;
}

.graph-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-header {
  height: 56px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  background: rgba(30, 41, 59, 0.6);
  backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
}

.graph-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.compare-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: 20px;
  padding-left: 20px;
  border-left: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.graph-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.graph-main {
  width: 100%;
  height: 100%;
}

.graph-single {
  width: 100%;
  height: 100%;
}

.graph-compare {
  display: flex;
  width: 100%;
  height: 100%;
}

.compare-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
}

.compare-col:last-child {
  border-right: none;
}

.compare-col-header {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: rgba(99, 102, 241, 0.05);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.compare-col:first-child .compare-col-header {
  color: #3b82f6;
}

.compare-col:last-child .compare-col-header {
  color: #10b981;
}

.echarts-container {
  flex: 1;
  width: 100%;
  min-height: 400px;
}

.empty-guide {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-tips {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.empty-actions {
  margin-top: 20px;
}

.drawer-content {
  padding: 0 4px;
}

.layer-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.summary-item {
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 12px;
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.summary-value {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.component-list {
  margin-top: 8px;
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.collapse-title.diff-only-left {
  color: #3b82f6;
}

.collapse-title.diff-only-right {
  color: #10b981;
}

.node-label {
  flex: 1;
}

.node-detail {
  padding: 4px 0;
}

.detail-section {
  margin-bottom: 12px;
}

.detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.relation-block {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.relation-col {
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.relation-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.relation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
}

.relation-item.upstream {
  background: rgba(59, 130, 246, 0.1);
}

.relation-item.downstream {
  background: rgba(16, 185, 129, 0.1);
}

.config-summary {
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 8px;
}

.stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-item {
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 10px;
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

:deep(.el-drawer__body) {
  background: var(--bg-card);
}

:deep(.el-collapse) {
  border: none;
  background: transparent;
}

:deep(.el-collapse-item__wrap) {
  border-bottom: 1px solid var(--border-color);
  background: transparent;
}

:deep(.el-collapse-item__header) {
  border-bottom: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
}

:deep(.el-descriptions__label) {
  width: 120px;
  color: var(--text-secondary);
  font-size: 12px;
}

:deep(.el-descriptions__body) {
  color: var(--text-primary);
  background: transparent;
}

:deep(.el-descriptions__cell) {
  padding: 8px 12px;
}

:deep(.el-descriptions--border .el-descriptions__table) {
  border: 1px solid var(--border-color);
}

:deep(.el-descriptions--border .el-descriptions__cell) {
  border: 1px solid var(--border-color);
}
</style>
