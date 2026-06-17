<template>
  <div class="help-manage">
    <div class="page-header fade-in-up">
      <h2 class="page-title">帮助管理</h2>
      <div class="header-actions">
        <el-button v-if="activeTab === 'categories'" type="primary" @click="openCategoryDialog()">
          <el-icon><Plus /></el-icon>新建分类
        </el-button>
        <el-button v-if="activeTab === 'articles'" type="primary" @click="openArticleDialog()">
          <el-icon><Plus /></el-icon>新建文章
        </el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="fade-in-up">
      <el-tab-pane label="分类管理" name="categories">
        <div class="category-section" v-loading="categoriesLoading">
          <div v-if="categories.length === 0" class="empty-state">
            <el-icon :size="48" color="var(--text-secondary)"><Folder /></el-icon>
            <p>暂无分类，点击「新建分类」开始创建</p>
          </div>
          <div v-else class="category-list">
            <div v-for="cat in categories" :key="cat.id" class="category-card">
              <div class="cat-header">
                <div class="cat-info">
                  <el-icon :size="20" color="var(--primary)"><component :is="cat.icon || 'Folder'" /></el-icon>
                  <span class="cat-name">{{ cat.name }}</span>
                  <span class="cat-slug">/help/{{ cat.slug }}</span>
                </div>
                <div class="cat-actions">
                  <el-button size="small" text @click="openCategoryDialog(cat)">
                    <el-icon><Edit /></el-icon>编辑
                  </el-button>
                  <el-button size="small" text type="danger" @click="handleDeleteCategory(cat)">
                    <el-icon><Delete /></el-icon>删除
                  </el-button>
                </div>
              </div>
              <div class="cat-stats">
                <span>排序: {{ cat.sort_order }}</span>
                <span>{{ cat.article_count }} 篇文章</span>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="文章管理" name="articles">
        <div class="article-section">
          <div class="filter-bar">
            <el-select v-model="filterCategory" placeholder="全部分类" style="width: 180px" @change="loadArticles">
              <el-option label="全部分类" value="" />
              <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
            </el-select>
            <el-select v-model="filterStatus" placeholder="全部状态" style="width: 140px" @change="loadArticles">
              <el-option label="全部状态" value="" />
              <el-option label="已发布" value="published" />
              <el-option label="草稿" value="draft" />
            </el-select>
            <el-input
              v-model="searchKeyword"
              placeholder="搜索文章标题..."
              style="width: 240px"
              clearable
              @keyup.enter="loadArticles"
              @clear="loadArticles"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>

          <div class="article-table-wrap" v-loading="articlesLoading">
            <el-table :data="articles" style="width: 100%">
              <el-table-column prop="id" label="ID" width="80" />
              <el-table-column prop="title" label="标题" min-width="200">
                <template #default="{ row }">
                  <div class="article-title-cell">
                    <span>{{ row.title }}</span>
                    <el-tag v-if="row.status === 'published'" type="success" size="small">已发布</el-tag>
                    <el-tag v-else type="info" size="small">草稿</el-tag>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="category_name" label="分类" width="140" />
              <el-table-column prop="sort_order" label="排序" width="80" />
              <el-table-column prop="view_count" label="浏览量" width="100" />
              <el-table-column prop="updated_at" label="更新时间" width="180">
                <template #default="{ row }">
                  {{ formatDate(row.updated_at) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="240" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" text @click="previewArticle(row)">
                    <el-icon><View /></el-icon>预览
                  </el-button>
                  <el-button size="small" text @click="openArticleDialog(row)">
                    <el-icon><Edit /></el-icon>编辑
                  </el-button>
                  <el-button size="small" text type="danger" @click="handleDeleteArticle(row)">
                    <el-icon><Delete /></el-icon>删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <div class="pagination-wrap">
              <el-pagination
                v-model:current-page="page"
                v-model:page-size="pageSize"
                :total="articlesTotal"
                layout="total, prev, pager, next"
                @current-change="loadArticles"
                @size-change="loadArticles"
              />
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="categoryDialogVisible"
      :title="editingCategory?.id ? '编辑分类' : '新建分类'"
      width="500px"
      destroy-on-close
    >
      <el-form ref="categoryFormRef" :model="categoryForm" :rules="categoryRules" label-width="80px">
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="categoryForm.name" placeholder="请输入分类名称" maxlength="50" />
        </el-form-item>
        <el-form-item label="分类标识" prop="slug">
          <el-input v-model="categoryForm.slug" placeholder="如: quickstart" maxlength="100" />
          <div class="form-tip">用于 URL 路径，只能包含字母、数字、下划线和连字符</div>
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="categoryForm.icon" placeholder="图标名称，如 Guide" maxlength="50" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="categoryForm.sort_order" :min="0" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="categorySubmitting" @click="submitCategory">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="articleDialogVisible"
      :title="editingArticle?.id ? '编辑文章' : '新建文章'"
      width="900px"
      class="article-dialog"
      destroy-on-close
    >
      <el-form ref="articleFormRef" :model="articleForm" :rules="articleRules" label-width="80px">
        <el-row :gutter="16">
          <el-col :span="16">
            <el-form-item label="文章标题" prop="title">
              <el-input v-model="articleForm.title" placeholder="请输入文章标题" maxlength="200" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="文章标识" prop="slug">
              <el-input v-model="articleForm.slug" placeholder="如: welcome" maxlength="200" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="分类" prop="category_id">
              <el-select v-model="articleForm.category_id" placeholder="请选择分类" style="width: 100%">
                <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="排序">
              <el-input-number v-model="articleForm.sort_order" :min="0" :max="999" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="状态">
              <el-select v-model="articleForm.status" style="width: 100%">
                <el-option label="草稿" value="draft" />
                <el-option label="已发布" value="published" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="文章内容" prop="content">
          <div class="markdown-editor">
            <div class="editor-toolbar">
              <span class="toolbar-label">Markdown 编辑器</span>
              <div class="toolbar-actions">
                <el-button size="small" :type="editMode === 'edit' ? 'primary' : 'default'" @click="editMode = 'edit'">编辑</el-button>
                <el-button size="small" :type="editMode === 'preview' ? 'primary' : 'default'" @click="editMode = 'preview'">预览</el-button>
                <el-button size="small" :type="editMode === 'split' ? 'primary' : 'default'" @click="editMode = 'split'">分屏</el-button>
              </div>
            </div>
            <div class="editor-body" :class="editMode">
              <div v-show="editMode !== 'preview'" class="editor-pane edit-pane">
                <textarea
                  v-model="articleForm.content"
                  placeholder="请输入 Markdown 内容..."
                  class="markdown-textarea"
                ></textarea>
              </div>
              <div v-show="editMode !== 'edit'" class="editor-pane preview-pane">
                <div class="markdown-body" v-html="previewHtml"></div>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="articleDialogVisible = false">取消</el-button>
        <el-button :loading="articleSubmitting" @click="saveArticle(false)">保存草稿</el-button>
        <el-button type="primary" :loading="articleSubmitting" @click="saveArticle(true)">发布</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="previewDialogVisible"
      title="文章预览"
      width="800px"
      class="preview-dialog"
      destroy-on-close
    >
      <div v-if="previewArticleData" class="preview-content">
        <h1 class="preview-title">{{ previewArticleData.title }}</h1>
        <div class="preview-meta">
          <span>{{ previewArticleData.category_name }}</span>
          <el-tag v-if="previewArticleData.status === 'published'" type="success" size="small">已发布</el-tag>
          <el-tag v-else type="info" size="small">草稿</el-tag>
        </div>
        <div class="preview-body markdown-body" v-html="previewArticleHtml"></div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/request'
import { parseMarkdown } from '@/utils/markdown'

const activeTab = ref('categories')

const categoriesLoading = ref(false)
const categories = ref([])

const articlesLoading = ref(false)
const articles = ref([])
const articlesTotal = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filterCategory = ref('')
const filterStatus = ref('')
const searchKeyword = ref('')

const categoryDialogVisible = ref(false)
const categorySubmitting = ref(false)
const editingCategory = ref(null)
const categoryFormRef = ref()
const categoryForm = reactive({
  name: '',
  slug: '',
  icon: '',
  sort_order: 0
})
const categoryRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
  slug: [{ required: true, message: '请输入分类标识', trigger: 'blur' }]
}

const articleDialogVisible = ref(false)
const articleSubmitting = ref(false)
const editingArticle = ref(null)
const articleFormRef = ref()
const editMode = ref('split')
const articleForm = reactive({
  title: '',
  slug: '',
  content: '',
  category_id: null,
  sort_order: 0,
  status: 'draft'
})
const articleRules = {
  title: [{ required: true, message: '请输入文章标题', trigger: 'blur' }],
  slug: [{ required: true, message: '请输入文章标识', trigger: 'blur' }],
  category_id: [{ required: true, message: '请选择分类', trigger: 'change' }]
}

const previewDialogVisible = ref(false)
const previewArticleData = ref(null)

const previewHtml = computed(() => {
  return parseMarkdown(articleForm.content)
})

const previewArticleHtml = computed(() => {
  if (!previewArticleData.value) return ''
  return parseMarkdown(previewArticleData.value.content)
})

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const loadCategories = async () => {
  categoriesLoading.value = true
  try {
    const res = await api.get('/help/admin/categories')
    categories.value = res.data
  } catch (err) {
    console.error('Load categories error:', err)
  } finally {
    categoriesLoading.value = false
  }
}

const loadArticles = async () => {
  articlesLoading.value = true
  try {
    const params = {
      page: page.value,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value
    }
    if (filterCategory.value) params.category_id = filterCategory.value
    if (filterStatus.value) params.status = filterStatus.value
    if (searchKeyword.value) params.keyword = searchKeyword.value

    const res = await api.get('/help/admin/articles', { params })
    articles.value = res.data
    articlesTotal.value = res.total
  } catch (err) {
    console.error('Load articles error:', err)
  } finally {
    articlesLoading.value = false
  }
}

const openCategoryDialog = (cat) => {
  editingCategory.value = cat || null
  if (cat) {
    categoryForm.name = cat.name
    categoryForm.slug = cat.slug
    categoryForm.icon = cat.icon || ''
    categoryForm.sort_order = cat.sort_order
  } else {
    categoryForm.name = ''
    categoryForm.slug = ''
    categoryForm.icon = ''
    categoryForm.sort_order = 0
  }
  categoryDialogVisible.value = true
  nextTick(() => {
    categoryFormRef.value?.clearValidate()
  })
}

const submitCategory = async () => {
  const valid = await categoryFormRef.value?.validate().catch(() => false)
  if (!valid) return

  categorySubmitting.value = true
  try {
    if (editingCategory.value) {
      await api.put(`/help/admin/categories/${editingCategory.value.id}`, categoryForm)
      ElMessage.success('更新成功')
    } else {
      await api.post('/help/admin/categories', categoryForm)
      ElMessage.success('创建成功')
    }
    categoryDialogVisible.value = false
    loadCategories()
  } catch (err) {
    console.error('Submit category error:', err)
  } finally {
    categorySubmitting.value = false
  }
}

const handleDeleteCategory = async (cat) => {
  try {
    await ElMessageBox.confirm(`确定要删除分类「${cat.name}」吗？`, '确认删除', {
      type: 'warning'
    })
    await api.delete(`/help/admin/categories/${cat.id}`)
    ElMessage.success('删除成功')
    loadCategories()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('Delete category error:', err)
    }
  }
}

const openArticleDialog = (article) => {
  editingArticle.value = article || null
  if (article) {
    articleForm.title = article.title
    articleForm.slug = article.slug
    articleForm.content = article.content || ''
    articleForm.category_id = article.category_id
    articleForm.sort_order = article.sort_order
    articleForm.status = article.status
  } else {
    articleForm.title = ''
    articleForm.slug = ''
    articleForm.content = ''
    articleForm.category_id = categories.value[0]?.id || null
    articleForm.sort_order = 0
    articleForm.status = 'draft'
  }
  editMode.value = 'split'
  articleDialogVisible.value = true
  nextTick(() => {
    articleFormRef.value?.clearValidate()
  })
}

const saveArticle = async (publish) => {
  const valid = await articleFormRef.value?.validate().catch(() => false)
  if (!valid) return

  articleSubmitting.value = true
  try {
    const formData = { ...articleForm }
    if (publish) {
      formData.status = 'published'
    }

    if (editingArticle.value) {
      await api.put(`/help/admin/articles/${editingArticle.value.id}`, formData)
      ElMessage.success(publish ? '发布成功' : '保存成功')
    } else {
      await api.post('/help/admin/articles', formData)
      ElMessage.success(publish ? '发布成功' : '创建成功')
    }
    articleDialogVisible.value = false
    loadArticles()
  } catch (err) {
    console.error('Save article error:', err)
  } finally {
    articleSubmitting.value = false
  }
}

const handleDeleteArticle = async (article) => {
  try {
    await ElMessageBox.confirm(`确定要删除文章「${article.title}」吗？`, '确认删除', {
      type: 'warning'
    })
    await api.delete(`/help/admin/articles/${article.id}`)
    ElMessage.success('删除成功')
    loadArticles()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('Delete article error:', err)
    }
  }
}

const previewArticle = async (article) => {
  try {
    const res = await api.get(`/help/admin/articles/preview/${article.id}`)
    previewArticleData.value = res.data
    previewDialogVisible.value = true
  } catch (err) {
    console.error('Preview article error:', err)
  }
}

onMounted(() => {
  loadCategories()
})
</script>

<style scoped>
.help-manage {
  padding: 24px 32px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.category-section {
  min-height: 200px;
}

.category-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.category-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 20px;
  transition: var(--transition);
}

.category-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-hover);
}

.cat-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.cat-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.cat-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.cat-slug {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

.cat-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.cat-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
  padding-top: 12px;
  border-top: 1px solid var(--border-color-light);
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.article-table-wrap {
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.article-title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary);
}

.empty-state p {
  margin-top: 12px;
  font-size: 14px;
}

.form-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.article-dialog :deep(.el-dialog__body) {
  padding-top: 0;
}

.markdown-editor {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.toolbar-actions {
  display: flex;
  gap: 4px;
}

.editor-body {
  display: flex;
  height: 400px;
}

.editor-body.edit .edit-pane {
  width: 100%;
}

.editor-body.edit .preview-pane {
  display: none;
}

.editor-body.preview .preview-pane {
  width: 100%;
}

.editor-body.preview .edit-pane {
  display: none;
}

.editor-body.split .editor-pane {
  width: 50%;
}

.editor-pane {
  overflow-y: auto;
}

.edit-pane {
  border-right: 1px solid var(--border-color);
}

.markdown-textarea {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 16px;
  font-size: 14px;
  line-height: 1.6;
  font-family: 'Consolas', 'Monaco', monospace;
  background: var(--bg-page);
  color: var(--text-primary);
}

.preview-pane {
  padding: 16px;
  background: var(--bg-page);
}

.preview-dialog :deep(.el-dialog__body) {
  max-height: 70vh;
  overflow-y: auto;
}

.preview-content {
  padding: 8px;
}

.preview-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 12px;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 14px;
}

.preview-body {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-primary);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.markdown-body :deep(h1) { font-size: 24px; }
.markdown-body :deep(h2) { font-size: 20px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
.markdown-body :deep(h3) { font-size: 17px; }
.markdown-body :deep(h4) { font-size: 15px; }
.markdown-body :deep(h5) { font-size: 14px; }
.markdown-body :deep(h6) { font-size: 13px; }

.markdown-body :deep(p) {
  margin-bottom: 16px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin-bottom: 16px;
  padding-left: 24px;
}

.markdown-body :deep(li) {
  margin-bottom: 6px;
}

.markdown-body :deep(blockquote) {
  margin: 16px 0;
  padding: 12px 20px;
  border-left: 4px solid var(--primary);
  background: rgba(99, 102, 241, 0.05);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
}

.markdown-body :deep(blockquote p) {
  margin: 0;
}

.markdown-body :deep(code) {
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--primary);
}

.markdown-body :deep(pre) {
  background: var(--bg-sidebar);
  padding: 16px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin-bottom: 16px;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  color: var(--text-primary);
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border-color);
  padding: 10px 14px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--bg-hover);
  font-weight: 600;
}

.markdown-body :deep(a) {
  color: var(--primary);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 24px 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}
</style>
