<template>
  <div class="flow-page">
    <!-- 左侧组件面板 -->
    <aside class="component-panel">
      <div class="panel-header">
        <h3>组件库</h3>
        <el-input v-model="searchComp" placeholder="搜索组件..." size="small" clearable prefix-icon="Search" />
      </div>
      <div class="component-list">
        <div v-for="cat in filteredCategories" :key="cat.key" class="comp-category">
          <div class="cat-title" @click="cat.expanded = !cat.expanded">
            <span class="cat-icon" :style="{ background: cat.color }">
              <el-icon><component :is="cat.icon" /></el-icon>
            </span>
            <span>{{ cat.label }}</span>
            <el-icon class="expand-icon" :class="{ rotated: cat.expanded }"><ArrowDown /></el-icon>
          </div>
          <transition name="slide">
            <div v-show="cat.expanded" class="cat-items">
              <div v-for="comp in cat.components" :key="comp.key" class="comp-item" draggable="true"
                @dragstart="onDragStart($event, cat.key, comp)" @click="addNode(cat.key, comp)">
                <span class="comp-dot" :style="{ background: cat.color }"></span>
                <span>{{ comp.label }}</span>
                <el-icon class="add-icon"><Plus /></el-icon>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </aside>

    <!-- 中间画布 -->
    <div class="canvas-area" @drop="onDrop" @dragover.prevent>
      <div class="canvas-toolbar">
        <div class="toolbar-left">
          <el-button @click="$router.back()" text><el-icon><ArrowLeft /></el-icon>返回</el-button>
          <el-divider direction="vertical" />
          <span class="pipeline-name">{{ pipelineName }}</span>
        </div>
        <div class="toolbar-right">
          <el-button size="small" plain @click="handleCheck"><el-icon><CircleCheck /></el-icon>检查</el-button>
          <el-button size="small" plain @click="handleSave" :loading="saving"><el-icon><FolderOpened /></el-icon>保存</el-button>
          <el-button v-if="userRole === 'admin'" size="small" type="primary" @click="handlePublish"><el-icon><Upload /></el-icon>发布</el-button>
          <el-button v-else size="small" type="primary" @click="handleSubmitApproval"><el-icon><Upload /></el-icon>提交审批</el-button>
          <el-button size="small" plain @click="showHistory = true"><el-icon><Clock /></el-icon>历史</el-button>
        </div>
      </div>
      <VueFlow
        ref="vueFlowRef"
        v-model:nodes="nodes"
        v-model:edges="edges"
        :default-viewport="{ zoom: 0.85, x: 50, y: 50 }"
        :connection-mode="ConnectionMode.Loose"
        :snap-to-grid="true"
        :snap-grid="[20, 20]"
        fit-view-on-init
        @connect="onConnect"
        @node-click="onNodeClick"
        @pane-click="selectedNode = null"
        class="flow-canvas"
      >
        <template #node-custom="nodeProps">
          <div class="custom-node" :class="{ selected: selectedNode?.id === nodeProps.id }" :style="{ borderColor: getCatColor(nodeProps.data.category) }">
            <div class="node-header" :style="{ background: getCatColor(nodeProps.data.category) + '22' }">
              <span class="node-cat-dot" :style="{ background: getCatColor(nodeProps.data.category) }"></span>
              <span class="node-label">{{ nodeProps.data.label }}</span>
            </div>
            <div class="node-body">
              <span class="node-type">{{ getCatLabel(nodeProps.data.category) }}</span>
            </div>
            <Handle type="target" :position="Position.Left" />
            <Handle type="source" :position="Position.Right" />
          </div>
        </template>
        <Background :gap="20" :size="1" pattern-color="rgba(99,102,241,0.08)" />
        <Controls position="bottom-left" />
        <MiniMap :node-color="miniMapNodeColor" :mask-color="'rgba(15,23,42,0.8)'" position="bottom-right" />
      </VueFlow>
    </div>

    <!-- 右侧配置面板 -->
    <aside class="config-panel" :class="{ open: !!selectedNode }">
      <template v-if="selectedNode">
        <div class="config-header">
          <h3>{{ selectedNode.data.label }}</h3>
          <el-button text circle @click="selectedNode = null"><el-icon><Close /></el-icon></el-button>
        </div>
        <el-divider />

        <div class="preset-actions">
          <el-select
            v-model="selectedPresetId"
            placeholder="加载预设..."
            size="small"
            style="width: 100%"
            filterable
            @change="handlePresetSelect"
          >
            <el-option
              v-for="p in componentPresets"
              :key="p.id"
              :value="p.id"
              :label="p.name"
            >
              <div class="preset-option">
                <span>{{ p.name }}</span>
                <el-tag v-if="p.is_public" type="success" size="small" effect="light">公开</el-tag>
                <span class="preset-usage">{{ p.usage_count }} 次</span>
              </div>
            </el-option>
          </el-select>
          <el-button
            size="small"
            type="primary"
            plain
            style="width: 100%; margin-top: 8px"
            @click="openSavePresetDialog"
          >
            <el-icon><Collection /></el-icon>另存为预设
          </el-button>
        </div>
        <el-divider>参数配置</el-divider>

        <el-form label-position="top" size="small">
          <el-form-item label="组件名称">
            <el-input v-model="selectedNode.data.label" @change="syncNodeData" />
          </el-form-item>
          <el-form-item label="组件类型">
            <el-tag :color="getCatColor(selectedNode.data.category) + '22'" :style="{ color: getCatColor(selectedNode.data.category) }">
              {{ getCatLabel(selectedNode.data.category) }} / {{ selectedNode.data.component }}
            </el-tag>
          </el-form-item>
          <template v-if="selectedNode.data.config">
            <el-form-item v-for="(value, key) in selectedNode.data.config" :key="key" :label="configLabels[key] || key">
              <el-switch v-if="typeof value === 'boolean'" v-model="selectedNode.data.config[key]" @change="syncNodeData" />
              <el-input-number v-else-if="typeof value === 'number'" v-model="selectedNode.data.config[key]" :min="0" style="width: 100%" @change="syncNodeData" />
              <el-select v-else-if="Array.isArray(value)" v-model="selectedNode.data.config[key]" multiple allow-create filterable style="width: 100%" @change="syncNodeData">
                <el-option v-for="v in value" :key="v" :label="v" :value="v" />
              </el-select>
              <el-input v-else v-model="selectedNode.data.config[key]" @change="syncNodeData" />
            </el-form-item>
          </template>
        </el-form>
        <div class="config-actions">
          <el-popconfirm title="确认删除此组件？" @confirm="deleteNode(selectedNode.id)">
            <template #reference>
              <el-button type="danger" plain size="small" style="width: 100%"><el-icon><Delete /></el-icon>删除组件</el-button>
            </template>
          </el-popconfirm>
        </div>
      </template>
      <div v-else class="config-empty">
        <el-icon :size="32" color="var(--text-secondary)"><InfoFilled /></el-icon>
        <p>点击画布中的组件<br />查看和编辑配置</p>
      </div>
    </aside>

    <!-- Diff 预览弹窗 -->
    <el-dialog
      v-model="diffDialogVisible"
      title="预设加载预览"
      width="600px"
      destroy-on-close
    >
      <div v-if="diffData" class="diff-preview">
        <div class="diff-info">
          <p>将应用预设「<strong>{{ diffData.presetName }}</strong>」到当前组件</p>
          <p class="diff-hint">以下字段将被覆盖：</p>
        </div>
        <div class="diff-list">
          <div
            v-for="(item, key) in diffData.changes"
            :key="key"
            class="diff-item"
          >
            <div class="diff-key">{{ configLabels[key] || key }}</div>
            <div class="diff-values">
              <div class="diff-old">
                <span class="diff-label">当前</span>
                <span class="diff-value">{{ formatDiffValue(item.oldValue) }}</span>
              </div>
              <el-icon class="diff-arrow"><ArrowRight /></el-icon>
              <div class="diff-new">
                <span class="diff-label">预设</span>
                <span class="diff-value">{{ formatDiffValue(item.newValue) }}</span>
              </div>
            </div>
          </div>
          <div v-if="diffData.changes && Object.keys(diffData.changes).length === 0" class="diff-no-change">
            <el-icon><CircleCheck /></el-icon>
            <span>当前配置与预设一致，无需更新</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="diffDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="diffData && Object.keys(diffData.changes).length === 0"
          @click="confirmLoadPreset"
        >
          确认应用
        </el-button>
      </template>
    </el-dialog>

    <!-- 另存为预设弹窗 -->
    <el-dialog
      v-model="savePresetDialogVisible"
      title="另存为预设"
      width="500px"
      destroy-on-close
      @close="resetSavePresetForm"
    >
      <el-form
        ref="savePresetFormRef"
        :model="savePresetForm"
        :rules="savePresetRules"
        label-width="90px"
        label-position="left"
      >
        <el-form-item label="预设名称" prop="name">
          <el-input
            v-model="savePresetForm.name"
            placeholder="请输入预设名称"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="savePresetForm.description"
            type="textarea"
            :rows="2"
            placeholder="请输入描述信息"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="savePresetForm.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入标签后按回车添加"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="是否公开">
          <el-switch
            v-model="savePresetForm.is_public"
            active-text="公开"
            inactive-text="私有"
          />
          <div class="tip-text">
            公开预设所有用户可见，私有预设仅您自己可见
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="savePresetDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPreset" @click="handleSavePreset">
          保存预设
        </el-button>
      </template>
    </el-dialog>

    <!-- 历史记录抽屉 -->
    <el-drawer v-model="showHistory" title="发布历史" size="400px">
      <div v-loading="historyLoading">
        <el-timeline v-if="historyList.length">
          <el-timeline-item v-for="h in historyList" :key="h.id" :timestamp="formatDate(h.created_at)" placement="top" :color="'var(--primary)'">
            <div class="history-item">
              <div class="history-meta">
                <el-tag size="small" type="primary">v{{ h.version }}</el-tag>
                <span>{{ h.operator }}</span>
                <span class="history-action">{{ h.action === 'publish' ? '发布' : '回滚' }}</span>
              </div>
              <p v-if="h.remark" class="history-remark">{{ h.remark }}</p>
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无发布记录" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, markRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow, Position, ConnectionMode, Handle } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/request'
import dayjs from 'dayjs'
import {
  buildCategories,
  getCategoryMeta,
  getConfigLabel,
  getComponentSchema,
  validateFlow
} from '@shared/index.js'

const route = useRoute()
const router = useRouter()
const pipelineId = route.params.id

const nodes = ref([])
const edges = ref([])
const selectedNode = ref(null)
const pipelineName = ref('')
const saving = ref(false)
const showHistory = ref(false)
const historyLoading = ref(false)
const historyList = ref([])
const searchComp = ref('')
const vueFlowRef = ref(null)
const userInfo = computed(() => {
  try { return JSON.parse(localStorage.getItem('userInfo') || '{}') } catch { return {} }
})
const userRole = computed(() => userInfo.value?.role || 'viewer')

const selectedPresetId = ref(null)
const componentPresets = ref([])
const loadingPresets = ref(false)
const diffDialogVisible = ref(false)
const diffData = ref(null)
const pendingPreset = ref(null)
const savePresetDialogVisible = ref(false)
const savingPreset = ref(false)
const savePresetFormRef = ref(null)

const savePresetForm = reactive({
  name: '',
  description: '',
  tags: [],
  is_public: false
})

const savePresetRules = {
  name: [{ required: true, message: '请输入预设名称', trigger: 'blur' }]
}

let nodeCounter = 100

const categories = reactive(buildCategories())

const configLabels = new Proxy({}, {
  get: (_, key) => getConfigLabel(key)
})

const filteredCategories = computed(() => {
  if (!searchComp.value) return categories
  const kw = searchComp.value.toLowerCase()
  return categories.map(cat => ({
    ...cat,
    expanded: true,
    components: cat.components.filter(c => c.label.toLowerCase().includes(kw) || c.key.toLowerCase().includes(kw))
  })).filter(cat => cat.components.length > 0)
})

const getCatColor = (key) => getCategoryMeta(key)?.color || '#94a3b8'
const getCatLabel = (key) => getCategoryMeta(key)?.label || key
const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'
const miniMapNodeColor = (node) => getCatColor(node.data?.category)

const addNode = (catKey, comp) => {
  const id = `node-${++nodeCounter}`
  const newNode = {
    id,
    type: 'custom',
    position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 300 },
    data: {
      category: catKey,
      component: comp.key,
      label: comp.label,
      config: JSON.parse(JSON.stringify(comp.config))
    }
  }
  nodes.value = [...nodes.value, newNode]
}

const onDragStart = (event, catKey, comp) => {
  event.dataTransfer.setData('application/json', JSON.stringify({ catKey, comp }))
  event.dataTransfer.effectAllowed = 'move'
}

const onDrop = (event) => {
  const data = event.dataTransfer.getData('application/json')
  if (!data) return
  const { catKey, comp } = JSON.parse(data)
  const bounds = event.currentTarget.getBoundingClientRect()
  const id = `node-${++nodeCounter}`
  const newNode = {
    id,
    type: 'custom',
    position: { x: event.clientX - bounds.left - 80, y: event.clientY - bounds.top - 30 },
    data: {
      category: catKey,
      component: comp.key,
      label: comp.label,
      config: JSON.parse(JSON.stringify(comp.config))
    }
  }
  nodes.value = [...nodes.value, newNode]
}

const onConnect = (params) => {
  const newEdge = {
    id: `e-${params.source}-${params.target}`,
    source: params.source,
    target: params.target,
    animated: true,
    style: { stroke: 'var(--primary)', strokeWidth: 2 }
  }
  edges.value = [...edges.value, newEdge]
}

const onNodeClick = (event) => {
  const node = nodes.value.find(n => n.id === event.node.id)
  if (node) selectedNode.value = node
}

const syncNodeData = () => {
  nodes.value = [...nodes.value]
}

const deleteNode = (id) => {
  nodes.value = nodes.value.filter(n => n.id !== id)
  edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
  selectedNode.value = null
}

const handleSave = async () => {
  saving.value = true
  try {
    await api.put(`/flows/${pipelineId}`, { flowData: { nodes: nodes.value, edges: edges.value } })
    ElMessage.success('保存成功')
  } catch { /* handled */ } finally { saving.value = false }
}

const handleCheck = async () => {
  try {
    const res = await api.post(`/flows/${pipelineId}/check`)
    if (res.data.valid) {
      ElMessage.success('编排检查通过，所有组件连接正常')
    } else {
      ElMessageBox.alert(res.data.errors.join('\n'), '检查发现问题', { type: 'warning', confirmButtonText: '知道了' })
    }
  } catch { /* handled */ }
}

const handlePublish = async () => {
  try {
    await handleSave()
    const { value: remark } = await ElMessageBox.prompt('请输入发布备注', '发布确认', {
      confirmButtonText: '发布', cancelButtonText: '取消', inputPlaceholder: '可选备注信息...'
    })
    await api.post(`/flows/${pipelineId}/publish`, { remark })
    ElMessage.success('发布成功')
  } catch { /* handled */ }
}

const handleSubmitApproval = async () => {
  try {
    await handleSave()
    const { value: remark } = await ElMessageBox.prompt('请输入发布备注', '提交审批', {
      confirmButtonText: '提交', cancelButtonText: '取消', inputPlaceholder: '可选备注信息...'
    })
    await api.post(`/approval/${pipelineId}`, { remark })
    ElMessage.success('已提交审批，请等待管理员审核')
  } catch { /* handled */ }
}

const loadHistory = async () => {
  historyLoading.value = true
  try {
    const res = await api.get(`/flows/${pipelineId}/history`)
    historyList.value = res.data
  } catch { /* handled */ } finally { historyLoading.value = false }
}

const loadComponentPresets = async (componentType) => {
  if (!componentType) {
    componentPresets.value = []
    return
  }
  loadingPresets.value = true
  try {
    const res = await api.get(`/presets/component/${componentType}`)
    componentPresets.value = res.data || []
  } catch { /* handled */ } finally {
    loadingPresets.value = false
  }
}

watch(selectedNode, (newNode) => {
  if (newNode?.data?.component) {
    loadComponentPresets(newNode.data.component)
    selectedPresetId.value = null
  } else {
    componentPresets.value = []
    selectedPresetId.value = null
  }
})

const computeDiff = (currentConfig, presetConfig) => {
  const changes = {}
  const allKeys = new Set([...Object.keys(currentConfig || {}), ...Object.keys(presetConfig || {})])

  for (const key of allKeys) {
    const oldVal = currentConfig?.[key]
    const newVal = presetConfig?.[key]
    const oldStr = JSON.stringify(oldVal)
    const newStr = JSON.stringify(newVal)
    if (oldStr !== newStr) {
      changes[key] = { oldValue: oldVal, newValue: newVal }
    }
  }
  return changes
}

const formatDiffValue = (val) => {
  if (val === undefined || val === null) return '(空)'
  if (typeof val === 'boolean') return val ? '开启' : '关闭'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

const handlePresetSelect = async (presetId) => {
  if (!presetId || !selectedNode.value) return
  try {
    const res = await api.get(`/presets/${presetId}`)
    const preset = res.data
    pendingPreset.value = preset

    const changes = computeDiff(selectedNode.value.data.config, preset.config)
    diffData.value = {
      presetName: preset.name,
      presetId: preset.id,
      changes
    }
    diffDialogVisible.value = true
  } catch { /* handled */ } finally {
    selectedPresetId.value = null
  }
}

const confirmLoadPreset = async () => {
  if (!pendingPreset.value || !selectedNode.value) return
  try {
    await api.post(`/presets/${pendingPreset.value.id}/load`)
    selectedNode.value.data.config = JSON.parse(JSON.stringify(pendingPreset.value.config))
    syncNodeData()
    ElMessage.success('预设加载成功')
    diffDialogVisible.value = false
    pendingPreset.value = null
    loadComponentPresets(selectedNode.value.data.component)
  } catch { /* handled */ }
}

const openSavePresetDialog = () => {
  if (!selectedNode.value) return
  savePresetForm.name = `${selectedNode.value.data.label} 配置`
  savePresetForm.description = ''
  savePresetForm.tags = []
  savePresetForm.is_public = false
  savePresetDialogVisible.value = true
}

const resetSavePresetForm = () => {
  savePresetFormRef.value?.resetFields()
}

const handleSavePreset = async () => {
  if (!selectedNode.value) return
  await savePresetFormRef.value?.validate()
  savingPreset.value = true
  try {
    await api.post('/presets', {
      name: savePresetForm.name,
      component_type: selectedNode.value.data.component,
      config: JSON.parse(JSON.stringify(selectedNode.value.data.config)),
      description: savePresetForm.description,
      tags: savePresetForm.tags,
      is_public: savePresetForm.is_public
    })
    ElMessage.success('预设保存成功')
    savePresetDialogVisible.value = false
    loadComponentPresets(selectedNode.value.data.component)
  } catch { /* handled */ } finally {
    savingPreset.value = false
  }
}

const loadFlow = async () => {
  try {
    const pRes = await api.get(`/pipelines/${pipelineId}`)
    pipelineName.value = pRes.data.name
    const fRes = await api.get(`/flows/${pipelineId}`)
    if (fRes.data?.flow_data) {
      const fd = fRes.data.flow_data
      nodes.value = (fd.nodes || []).map(n => ({ ...n, type: 'custom' }))
      edges.value = (fd.edges || []).map(e => ({ ...e, animated: true, style: { stroke: 'var(--primary)', strokeWidth: 2 } }))
      nodeCounter = Math.max(nodeCounter, ...nodes.value.map(n => parseInt(n.id.replace('node-', '')) || 0))
    }
  } catch { /* handled */ }
}

onMounted(() => { loadFlow(); loadHistory() })
</script>

<style scoped>
.flow-page {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* 左侧组件面板 */
.component-panel {
  width: 260px;
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
  margin-bottom: 10px;
  color: var(--text-primary);
}
.component-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.comp-category { margin-bottom: 4px; }
.cat-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  transition: var(--transition);
}
.cat-title:hover { background: var(--bg-hover); }
.cat-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  flex-shrink: 0;
}
.expand-icon {
  margin-left: auto;
  transition: transform 0.3s;
  color: var(--text-secondary);
  font-size: 12px;
}
.expand-icon.rotated { transform: rotate(180deg); }
.cat-items { padding: 4px 0 4px 16px; }
.comp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: grab;
  transition: var(--transition);
}
.comp-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.comp-item:active { cursor: grabbing; }
.comp-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.add-icon {
  margin-left: auto;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}
.comp-item:hover .add-icon { opacity: 1; }

/* 画布区域 */
.canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.canvas-toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pipeline-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.flow-canvas {
  flex: 1;
  background: var(--bg-dark);
}

/* 自定义节点 */
.custom-node {
  min-width: 160px;
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  transition: var(--transition);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.custom-node:hover, .custom-node.selected {
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);
  transform: translateY(-1px);
}
.node-header {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.node-cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.node-body {
  padding: 6px 12px 10px;
}
.node-type {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 右侧配置面板 */
.config-panel {
  width: 0;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  transition: width 0.3s ease;
  flex-shrink: 0;
}
.config-panel.open {
  width: 320px;
  padding: 20px;
}
.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.config-header h3 {
  font-size: 16px;
  font-weight: 600;
}
.config-actions {
  margin-top: 24px;
}
.config-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.config-empty p { margin-top: 12px; }

/* 历史 */
.history-item { padding: 4px 0; }
.history-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.history-action {
  padding: 2px 8px;
  background: rgba(99, 102, 241, 0.15);
  border-radius: 10px;
  font-size: 11px;
  color: var(--primary);
}
.history-remark {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* Vue Flow 覆盖 */
:deep(.vue-flow__edge-path) { stroke: var(--primary) !important; }
:deep(.vue-flow__controls) { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); }
:deep(.vue-flow__controls button) { background: transparent; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); }
:deep(.vue-flow__controls button:hover) { background: var(--bg-hover); }
:deep(.vue-flow__controls button svg) { fill: var(--text-secondary); }
:deep(.vue-flow__minimap) { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); }
:deep(.vue-flow__handle) { width: 10px; height: 10px; background: var(--primary); border: 2px solid var(--bg-card); }

.slide-enter-active, .slide-leave-active { transition: all 0.3s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { max-height: 0; opacity: 0; }
.slide-enter-to, .slide-leave-from { max-height: 500px; opacity: 1; }

.preset-actions {
  margin-bottom: 8px;
}

.preset-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.preset-option span:first-child {
  flex: 1;
  font-size: 13px;
}

.preset-usage {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.diff-preview {
  display: flex;
  flex-direction: column;
}

.diff-info {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.diff-info p {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
}

.diff-hint {
  font-size: 12px !important;
  color: var(--text-secondary) !important;
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diff-item {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.diff-key {
  font-size: 13px;
  font-weight: 500;
  color: var(--primary);
  margin-bottom: 8px;
}

.diff-values {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diff-old, .diff-new {
  flex: 1;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
}

.diff-old {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.diff-new {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.diff-label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.diff-value {
  display: block;
  font-family: 'Consolas', 'Monaco', monospace;
  word-break: break-all;
}

.diff-arrow {
  color: var(--text-secondary);
  font-size: 16px;
  flex-shrink: 0;
}

.diff-no-change {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.diff-no-change .el-icon {
  color: var(--color-success);
  font-size: 20px;
}

.tip-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>
