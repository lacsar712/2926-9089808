<template>
  <div class="page-container">
    <div class="page-header fade-in-up">
      <h2 class="page-title">我的收藏</h2>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar fade-in-up">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索生产线名或备注..."
          clearable
          style="width: 280px"
          @keyup.enter="loadBookmarks"
          @clear="loadBookmarks"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="loadBookmarks" :loading="loading">
          <el-icon><Refresh /></el-icon>搜索
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-button
          type="danger"
          :disabled="selectedIds.length === 0"
          @click="handleBatchUnbookmark"
        >
          <el-icon><Delete /></el-icon>批量取消收藏
        </el-button>
        <el-button type="success" @click="handleExport">
          <el-icon><Download /></el-icon>导出 CSV
        </el-button>
      </div>
    </div>

    <!-- 分组折叠列表 -->
    <div class="bookmarks-container fade-in-up" v-loading="loading">
      <div v-if="groupedData.length === 0 && !loading" class="empty-state">
        <el-empty description="暂无收藏记录" />
      </div>

      <div v-for="group in groupedData" :key="group.pipeline_id" class="pipeline-group">
        <div class="group-header" @click="toggleGroup(group.pipeline_id)">
          <div class="group-left">
            <el-icon class="expand-icon" :class="{ expanded: expandedGroups.includes(group.pipeline_id) }">
              <ArrowRight />
            </el-icon>
            <el-icon class="group-icon"><Operation /></el-icon>
            <span class="group-name">{{ group.pipeline_name }}</span>
            <el-tag size="small" type="info">{{ group.items.length }} 条收藏</el-tag>
          </div>
          <div class="group-right">
            <el-checkbox
              :model-value="isAllSelectedInGroup(group)"
              :indeterminate="isIndeterminateInGroup(group)"
              @change="(val) => toggleGroupSelection(group, val)"
              @click.stop
            >
              全选
            </el-checkbox>
          </div>
        </div>

        <div v-show="expandedGroups.includes(group.pipeline_id)" class="group-content">
          <el-table
            :data="group.items"
            stripe
            @selection-change="handleSelectionChange"
            ref="bookmarkTable"
          >
            <el-table-column type="selection" width="55" :reserve-selection="true" />
            <el-table-column prop="run_id" label="运行ID" width="100" />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <span class="status-badge" :class="row.status">
                  <span class="dot"></span>{{ runStatusMap[row.status] }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="120">
              <template #default="{ row }">{{ calcDuration(row.start_time, row.end_time) }}</template>
            </el-table-column>
            <el-table-column label="输入/输出" width="180">
              <template #default="{ row }">
                <span style="color: var(--info);">{{ row.total_input?.toLocaleString() }}</span>
                <span style="color: var(--text-secondary); margin: 0 4px;">→</span>
                <span style="color: var(--success);">{{ row.total_output?.toLocaleString() }}</span>
              </template>
            </el-table-column>
            <el-table-column label="错误数" width="100">
              <template #default="{ row }">
                <span :style="{ color: row.error_count > 0 ? 'var(--danger)' : 'var(--text-secondary)' }">
                  {{ row.error_count }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="bookmark_remark" label="备注" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.bookmark_remark" class="remark-text">{{ row.bookmark_remark }}</span>
                <span v-else class="text-placeholder">无备注</span>
              </template>
            </el-table-column>
            <el-table-column label="收藏时间" width="180">
              <template #default="{ row }">{{ formatDate(row.bookmark_time) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="$router.push(`/monitor/detail/${row.run_id}`)">
                  <el-icon><View /></el-icon>详情
                </el-button>
                <el-button size="small" type="danger" link @click="handleUnbookmark(row)">
                  <el-icon><StarFilled /></el-icon>取消收藏
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination-area fade-in-up" v-if="total > 0">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadBookmarks"
        @current-change="loadBookmarks"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/request'
import dayjs from 'dayjs'

const loading = ref(false)
const searchKeyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const bookmarkList = ref([])
const selectedIds = ref([])
const expandedGroups = ref([])

const runStatusMap = { running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消' }

const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'

const calcDuration = (s, e) => {
  if (!s) return '-'
  if (!e) return '进行中...'
  const diff = dayjs(e).diff(dayjs(s), 'minute')
  return diff >= 60 ? `${Math.floor(diff / 60)}h ${diff % 60}m` : `${diff}m`
}

const groupedData = computed(() => {
  const groups = {}
  bookmarkList.value.forEach(item => {
    if (!groups[item.pipeline_id]) {
      groups[item.pipeline_id] = {
        pipeline_id: item.pipeline_id,
        pipeline_name: item.pipeline_name,
        items: []
      }
    }
    groups[item.pipeline_id].items.push(item)
  })
  return Object.values(groups)
})

const loadBookmarks = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value
    }
    if (searchKeyword.value.trim()) {
      params.keyword = searchKeyword.value.trim()
    }
    const res = await api.get('/bookmarks', { params })
    bookmarkList.value = res.data.list
    total.value = res.data.total
    const pipelineIds = [...new Set(bookmarkList.value.map(b => b.pipeline_id))]
    expandedGroups.value = pipelineIds
  } catch {
    /* handled */
  } finally {
    loading.value = false
  }
}

const toggleGroup = (pipelineId) => {
  const index = expandedGroups.value.indexOf(pipelineId)
  if (index > -1) {
    expandedGroups.value.splice(index, 1)
  } else {
    expandedGroups.value.push(pipelineId)
  }
}

const handleSelectionChange = (selection) => {
  selectedIds.value = selection.map(s => s.run_id)
}

const isAllSelectedInGroup = (group) => {
  return group.items.every(item => selectedIds.value.includes(item.run_id))
}

const isIndeterminateInGroup = (group) => {
  const selectedInGroup = group.items.filter(item => selectedIds.value.includes(item.run_id)).length
  return selectedInGroup > 0 && selectedInGroup < group.items.length
}

const toggleGroupSelection = (group, selected) => {
  const groupIds = group.items.map(i => i.run_id)
  if (selected) {
    selectedIds.value = [...new Set([...selectedIds.value, ...groupIds])]
  } else {
    selectedIds.value = selectedIds.value.filter(id => !groupIds.includes(id))
  }
}

const handleUnbookmark = async (row) => {
  try {
    await ElMessageBox.confirm('确定要取消收藏此运行记录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await api.delete(`/bookmarks/${row.run_id}`)
    ElMessage.success('已取消收藏')
    loadBookmarks()
  } catch {
    /* user cancelled */
  }
}

const handleBatchUnbookmark = async () => {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先选择要取消收藏的记录')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要取消选中的 ${selectedIds.value.length} 条收藏吗？`,
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await api.delete('/bookmarks', { data: { runIds: selectedIds.value } })
    ElMessage.success(`已取消 ${selectedIds.value.length} 条收藏`)
    selectedIds.value = []
    loadBookmarks()
  } catch {
    /* user cancelled */
  }
}

const handleExport = async () => {
  try {
    const params = {}
    if (searchKeyword.value.trim()) {
      params.keyword = searchKeyword.value.trim()
    }
    const blob = await api.get('/bookmarks/export', {
      params,
      responseType: 'blob'
    })
    const url = window.URL.createObjectURL(new Blob([blob]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `bookmarks_${dayjs().format('YYYYMMDD_HHmmss')}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch {
    ElMessage.error('导出失败')
  }
}

onMounted(loadBookmarks)
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 16px 20px;
  margin-bottom: 16px;
}
.toolbar-left, .toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.bookmarks-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pipeline-group {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  overflow: hidden;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--bg-dark);
  cursor: pointer;
  transition: var(--transition);
  border-bottom: 1px solid var(--border-color);
}
.group-header:hover {
  background: var(--bg-hover);
}

.group-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.expand-icon {
  color: var(--text-secondary);
  transition: transform 0.3s ease;
  font-size: 14px;
}
.expand-icon.expanded {
  transform: rotate(90deg);
}

.group-icon {
  color: var(--primary);
  font-size: 18px;
}

.group-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.group-content {
  padding: 0;
}

.remark-text {
  color: var(--text-primary);
}

.text-placeholder {
  color: var(--text-secondary);
  font-style: italic;
}

.empty-state {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 60px 0;
}

.pagination-area {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 16px 20px;
}
</style>
