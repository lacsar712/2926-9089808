<template>
  <div class="help-center">
    <div class="help-header">
      <div class="help-search">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索帮助文档..."
          size="large"
          clearable
          @keyup.enter="handleSearch"
          @input="debounceSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <div v-if="searchResults.length > 0 || searchLoading" class="search-dropdown">
          <div v-if="searchLoading" class="search-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>搜索中...</span>
          </div>
          <div v-else class="search-results">
            <div v-for="item in searchResults" :key="item.id" class="search-item" @click="goToArticle(item.id)">
              <div class="search-item-title" v-html="highlightText(item.title)"></div>
              <div class="search-item-category">{{ item.category_name }}</div>
              <div class="search-item-snippet" v-html="highlightText(item.snippet)"></div>
            </div>
            <div v-if="searchResults.length === 0" class="search-empty">
              未找到相关内容
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="help-body">
      <div class="help-sidebar">
        <div class="sidebar-title">
          <el-icon><Menu /></el-icon>
          <span>文档分类</span>
        </div>
        <div class="category-tree">
          <div v-for="category in categories" :key="category.id" class="category-item">
            <div
              class="category-header"
              :class="{ active: expandedCategories.includes(category.id) }"
              @click="toggleCategory(category.id)"
            >
              <el-icon class="arrow-icon" :class="{ expanded: expandedCategories.includes(category.id) }">
                <ArrowRight />
              </el-icon>
              <el-icon class="category-icon">
                <component :is="category.icon || 'Document'" />
              </el-icon>
              <span class="category-name">{{ category.name }}</span>
            </div>
            <div v-show="expandedCategories.includes(category.id)" class="article-list">
              <div
                v-for="article in category.articles"
                :key="article.id"
                class="article-item"
                :class="{ active: currentArticle?.id === article.id }"
                @click="selectArticle(article.id)"
              >
                <el-icon><Document /></el-icon>
                <span>{{ article.title }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="help-content">
        <div v-if="articleLoading" class="loading-wrap">
          <el-icon class="is-loading" :size="32"><Loading /></el-icon>
          <p>加载中...</p>
        </div>
        <div v-else-if="currentArticle" class="article-detail">
          <div class="article-breadcrumb">
            <el-breadcrumb separator="/">
              <el-breadcrumb-item>帮助中心</el-breadcrumb-item>
              <el-breadcrumb-item>{{ currentArticle.category_name }}</el-breadcrumb-item>
              <el-breadcrumb-item>{{ currentArticle.title }}</el-breadcrumb-item>
            </el-breadcrumb>
          </div>

          <h1 class="article-title">{{ currentArticle.title }}</h1>

          <div class="article-meta">
            <span><el-icon><View /></el-icon> {{ currentArticle.view_count }} 次浏览</span>
            <span>更新于 {{ formatDate(currentArticle.updated_at) }}</span>
          </div>

          <div class="article-body-wrap">
            <div class="article-content markdown-body" ref="articleContentRef" v-html="renderedContent"></div>
            
            <div v-if="headings.length > 0" class="article-toc">
              <div class="toc-title">
                <el-icon><List /></el-icon>
                <span>目录</span>
              </div>
              <div class="toc-list">
                <div
                  v-for="heading in headings"
                  :key="heading.id"
                  class="toc-item"
                  :class="[`level-${heading.level}`, { active: activeHeading === heading.id }]"
                  @click="scrollToHeading(heading.id)"
                >
                  {{ heading.text }}
                </div>
              </div>
            </div>
          </div>

          <div class="article-feedback">
            <div class="feedback-title">这篇文档有帮助吗？</div>
            <div class="feedback-buttons">
              <el-button
                :type="userFeedback === 1 ? 'success' : 'default'"
                @click="submitFeedback(1)"
                :disabled="feedbackSubmitting"
              >
                <el-icon><Good /></el-icon>
                有帮助 ({{ helpfulCount }})
              </el-button>
              <el-button
                :type="userFeedback === 0 ? 'danger' : 'default'"
                @click="submitFeedback(0)"
                :disabled="feedbackSubmitting"
              >
                <el-icon><Bad /></el-icon>
                没帮助 ({{ notHelpfulCount }})
              </el-button>
            </div>
            <div v-if="totalCount > 0" class="feedback-stats">
              <div class="stats-bar">
                <div
                  class="stats-bar-fill helpful"
                  :style="{ width: helpfulPercent + '%' }"
                ></div>
                <div
                  class="stats-bar-fill not-helpful"
                  :style="{ width: notHelpfulPercent + '%' }"
                ></div>
              </div>
              <div class="stats-text">
                {{ helpfulPercent }}% 的人觉得有帮助 ({{ totalCount }} 人评价)
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <el-icon :size="64" color="var(--text-secondary)"><QuestionFilled /></el-icon>
          <h3>欢迎使用帮助中心</h3>
          <p>从左侧选择一个分类开始浏览，或使用顶部搜索框查找内容</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/utils/request'
import { parseMarkdown, extractHeadings, generateId } from '@/utils/markdown'

const route = useRoute()
const router = useRouter()

const categories = ref([])
const currentArticle = ref(null)
const articleLoading = ref(false)
const expandedCategories = ref([])
const headings = ref([])
const activeHeading = ref('')
const articleContentRef = ref(null)

const searchKeyword = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
let searchTimer = null

const feedbackSubmitting = ref(false)
const userFeedback = ref(null)

const renderedContent = computed(() => {
  if (!currentArticle.value) return ''
  return parseMarkdown(currentArticle.value.content)
})

const helpfulCount = computed(() => currentArticle.value?.feedback?.helpful_count || 0)
const notHelpfulCount = computed(() => currentArticle.value?.feedback?.not_helpful_count || 0)
const totalCount = computed(() => currentArticle.value?.feedback?.total_count || 0)
const helpfulPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((helpfulCount.value / totalCount.value) * 100)
})
const notHelpfulPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((notHelpfulCount.value / totalCount.value) * 100)
})

const highlightText = (text) => {
  if (!text || !searchKeyword.value) return text
  const keyword = searchKeyword.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${keyword})`, 'gi')
  return text.replace(regex, '<mark class="search-highlight">$1</mark>')
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const loadCategories = async () => {
  try {
    const res = await api.get('/help/categories')
    categories.value = res.data
    if (res.data.length > 0) {
      expandedCategories.value = res.data.map(c => c.id)
    }
  } catch (err) {
    console.error('Load categories error:', err)
  }
}

const loadArticle = async (id) => {
  articleLoading.value = true
  try {
    const res = await api.get(`/help/articles/${id}`)
    currentArticle.value = res.data
    headings.value = extractHeadings(res.data.content)
    
    await nextTick()
    setupScrollListener()
    
    if (route.query.heading) {
      scrollToHeading(route.query.heading)
    }
  } catch (err) {
    ElMessage.error('加载文章失败')
    console.error('Load article error:', err)
  } finally {
    articleLoading.value = false
  }
}

const toggleCategory = (id) => {
  const index = expandedCategories.value.indexOf(id)
  if (index > -1) {
    expandedCategories.value.splice(index, 1)
  } else {
    expandedCategories.value.push(id)
  }
}

const selectArticle = (id) => {
  searchResults.value = []
  searchKeyword.value = ''
  router.push({ path: '/help', query: { id } })
  loadArticle(id)
}

const goToArticle = (id) => {
  searchResults.value = []
  searchKeyword.value = ''
  router.push({ path: '/help', query: { id } })
  loadArticle(id)
}

const debounceSearch = () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    handleSearch()
  }, 300)
}

const handleSearch = async () => {
  if (!searchKeyword.value.trim()) {
    searchResults.value = []
    return
  }
  
  searchLoading.value = true
  try {
    const res = await api.get('/help/search', {
      params: { keyword: searchKeyword.value, limit: 10 }
    })
    searchResults.value = res.data
  } catch (err) {
    console.error('Search error:', err)
  } finally {
    searchLoading.value = false
  }
}

const scrollToHeading = (id) => {
  if (!articleContentRef.value) return
  const element = articleContentRef.value.querySelector(`#${id}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

let scrollListener = null

const setupScrollListener = () => {
  if (scrollListener && articleContentRef.value) {
    articleContentRef.value.removeEventListener('scroll', scrollListener)
  }
  
  scrollListener = () => {
    if (!articleContentRef.value || headings.value.length === 0) return
    
    const content = articleContentRef.value
    const scrollTop = content.scrollTop
    
    let currentId = headings.value[0]?.id || ''
    
    for (let i = headings.value.length - 1; i >= 0; i--) {
      const heading = headings.value[i]
      const element = content.querySelector(`#${heading.id}`)
      if (element && element.offsetTop - 100 <= scrollTop) {
        currentId = heading.id
        break
      }
    }
    
    activeHeading.value = currentId
  }
  
  if (articleContentRef.value) {
    articleContentRef.value.addEventListener('scroll', scrollListener)
  }
}

const submitFeedback = async (isHelpful) => {
  if (!currentArticle.value) return
  
  feedbackSubmitting.value = true
  try {
    const res = await api.post(`/help/articles/${currentArticle.value.id}/feedback`, {
      is_helpful: isHelpful
    })
    userFeedback.value = isHelpful
    currentArticle.value.feedback = res.data
    ElMessage.success('感谢您的反馈')
  } catch (err) {
    console.error('Submit feedback error:', err)
  } finally {
    feedbackSubmitting.value = false
  }
}

watch(() => route.query.id, (newId) => {
  if (newId && (!currentArticle.value || currentArticle.value.id !== parseInt(newId))) {
    loadArticle(newId)
  }
})

onMounted(async () => {
  await loadCategories()
  
  const articleId = route.query.id
  if (articleId) {
    loadArticle(articleId)
  } else if (categories.value.length > 0) {
    const firstCategory = categories.value[0]
    if (firstCategory.articles && firstCategory.articles.length > 0) {
      const firstArticle = firstCategory.articles[0]
      router.replace({ path: '/help', query: { id: firstArticle.id } })
      loadArticle(firstArticle.id)
    }
  }
})

onBeforeUnmount(() => {
  if (scrollListener && articleContentRef.value) {
    articleContentRef.value.removeEventListener('scroll', scrollListener)
  }
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})
</script>

<style scoped>
.help-center {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-page);
}

.help-header {
  padding: 20px 32px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.help-search {
  max-width: 600px;
  margin: 0 auto;
  position: relative;
}

.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  max-height: 400px;
  overflow-y: auto;
}

.search-loading {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.search-results {
  padding: 8px 0;
}

.search-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: var(--transition);
  border-bottom: 1px solid var(--border-color-light);
}

.search-item:last-child {
  border-bottom: none;
}

.search-item:hover {
  background: var(--bg-hover);
}

.search-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.search-item-category {
  font-size: 12px;
  color: var(--primary);
  margin-bottom: 6px;
}

.search-item-snippet {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.search-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.help-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.help-sidebar {
  width: 260px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-title {
  padding: 16px 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-color);
}

.category-tree {
  padding: 8px;
}

.category-item {
  margin-bottom: 2px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: var(--transition);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.category-header:hover {
  background: var(--bg-hover);
}

.category-header.active {
  background: rgba(99, 102, 241, 0.1);
  color: var(--primary);
}

.arrow-icon {
  transition: transform 0.2s;
  font-size: 12px;
  color: var(--text-tertiary);
}

.arrow-icon.expanded {
  transform: rotate(90deg);
}

.category-icon {
  font-size: 16px;
}

.category-name {
  flex: 1;
}

.article-list {
  padding-left: 36px;
  padding-bottom: 4px;
}

.article-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: var(--transition);
  font-size: 13px;
  color: var(--text-secondary);
}

.article-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.article-item.active {
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary);
  font-weight: 500;
}

.article-item .el-icon {
  font-size: 14px;
}

.help-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px;
  position: relative;
}

.loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  gap: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-secondary);
}

.empty-state h3 {
  margin: 16px 0 8px;
  color: var(--text-primary);
  font-size: 18px;
}

.empty-state p {
  font-size: 14px;
}

.article-detail {
  max-width: 900px;
  margin: 0 auto;
}

.article-breadcrumb {
  margin-bottom: 16px;
}

.article-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 16px;
  line-height: 1.3;
}

.article-meta {
  display: flex;
  gap: 24px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}

.article-meta span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.article-body-wrap {
  display: flex;
  gap: 40px;
}

.article-content {
  flex: 1;
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-primary);
  overflow-y: auto;
  max-height: calc(100vh - 300px);
  padding-right: 20px;
}

.article-toc {
  width: 200px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  align-self: flex-start;
}

.toc-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.toc-list {
  border-left: 2px solid var(--border-color);
}

.toc-item {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: var(--transition);
  border-left: 2px solid transparent;
  margin-left: -2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toc-item:hover {
  color: var(--text-primary);
}

.toc-item.active {
  color: var(--primary);
  border-left-color: var(--primary);
  font-weight: 500;
}

.toc-item.level-1 { padding-left: 16px; }
.toc-item.level-2 { padding-left: 28px; }
.toc-item.level-3 { padding-left: 40px; font-size: 12px; }
.toc-item.level-4 { padding-left: 52px; font-size: 12px; }
.toc-item.level-5 { padding-left: 64px; font-size: 12px; }
.toc-item.level-6 { padding-left: 76px; font-size: 12px; }

.article-feedback {
  margin-top: 48px;
  padding-top: 32px;
  border-top: 1px solid var(--border-color);
  text-align: center;
}

.feedback-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.feedback-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 20px;
}

.feedback-stats {
  max-width: 300px;
  margin: 0 auto;
}

.stats-bar {
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  margin-bottom: 8px;
}

.stats-bar-fill {
  height: 100%;
  transition: width 0.3s;
}

.stats-bar-fill.helpful {
  background: #67C23A;
}

.stats-bar-fill.not-helpful {
  background: #F56C6C;
}

.stats-text {
  font-size: 12px;
  color: var(--text-secondary);
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
  scroll-margin-top: 20px;
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

.search-highlight {
  background: #fef08a;
  color: var(--text-primary);
  padding: 0 2px;
  border-radius: 2px;
}
</style>
