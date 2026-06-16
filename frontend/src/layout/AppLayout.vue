<template>
  <div class="app-layout">
    <aside class="sidebar" :class="{ collapsed: isCollapsed }">
      <div class="sidebar-header">
        <div class="logo-area">
          <div class="logo-icon">
            <el-icon :size="28"><Share /></el-icon>
          </div>
          <transition name="fade">
            <span v-if="!isCollapsed" class="logo-text">DataPipeline</span>
          </transition>
        </div>
        <el-icon class="collapse-btn" @click="isCollapsed = !isCollapsed">
          <component :is="isCollapsed ? 'Expand' : 'Fold'" />
        </el-icon>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapsed"
        class="sidebar-menu"
        background-color="transparent"
        text-color="#94a3b8"
        active-text-color="#818cf8"
        router
      >
        <el-sub-menu index="/pipeline-group">
          <template #title>
            <el-icon><Operation /></el-icon>
            <span>生产线管理</span>
          </template>
          <el-menu-item index="/pipeline">
            <el-icon><List /></el-icon>
            <template #title>生产线列表</template>
          </el-menu-item>
          <el-menu-item index="/pipeline/trash">
            <el-icon><Delete /></el-icon>
            <template #title>回收站</template>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/monitor">
          <el-icon><DataLine /></el-icon>
          <template #title>生产线监控</template>
        </el-menu-item>
        <el-menu-item index="/alert">
          <el-icon><Bell /></el-icon>
          <template #title>告警规则</template>
        </el-menu-item>
        <el-menu-item index="/lineage">
          <el-icon><Connection /></el-icon>
          <template #title>数据血缘</template>
        </el-menu-item>
        <el-menu-item index="/presets">
          <el-icon><SetUp /></el-icon>
          <template #title>参数预设库</template>
        </el-menu-item>
        <el-menu-item v-if="userRole === 'admin'" index="/approval">
          <el-icon><Check /></el-icon>
          <template #title>发布审批</template>
        </el-menu-item>
        <el-menu-item v-if="userRole === 'admin' || userRole === 'editor'" index="/approval/mine">
          <el-icon><Document /></el-icon>
          <template #title>我的申请</template>
        </el-menu-item>
        <el-sub-menu index="/system">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系统管理</span>
          </template>
          <el-menu-item index="/system/user">
            <el-icon><User /></el-icon>
            <template #title>用户管理</template>
          </el-menu-item>
          <el-menu-item index="/system/tag">
            <el-icon><PriceTag /></el-icon>
            <template #title>标签管理</template>
          </el-menu-item>
          <el-menu-item index="/system/environment">
            <el-icon><Monitor /></el-icon>
            <template #title>环境管理</template>
          </el-menu-item>
          <el-menu-item index="/system/log">
            <el-icon><Document /></el-icon>
            <template #title>操作日志</template>
          </el-menu-item>
          <el-menu-item index="/system/quota">
            <el-icon><Odometer /></el-icon>
            <template #title>资源配额</template>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="/settings">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>设置</span>
          </template>
          <el-menu-item index="/settings/api-keys">
            <el-icon><Key /></el-icon>
            <template #title>API 密钥</template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </aside>
    <div class="main-area">
      <header class="topbar">
        <div class="breadcrumb-area">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="$route.meta.title">{{ $route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="user-area">
          <div class="env-selector">
            <el-dropdown trigger="click" @command="handleEnvChange">
              <div class="env-badge" :class="currentEnv">
                <span class="env-dot"></span>
                <span class="env-label">{{ envLabel }}</span>
                <el-icon><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="development" :class="{ 'is-active': currentEnv === 'development' }">
                    <span class="env-dot development"></span>开发环境
                  </el-dropdown-item>
                  <el-dropdown-item command="test" :class="{ 'is-active': currentEnv === 'test' }">
                    <span class="env-dot test"></span>测试环境
                  </el-dropdown-item>
                  <el-dropdown-item command="production" :class="{ 'is-active': currentEnv === 'production' }">
                    <span class="env-dot production"></span>生产环境
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <el-dropdown trigger="click" @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" :style="{ background: 'var(--gradient-primary)' }">
                {{ userInfo?.nickname?.charAt(0) || 'U' }}
              </el-avatar>
              <span class="username">{{ userInfo?.nickname || '用户' }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <el-icon><User /></el-icon>
                  {{ userInfo?.username }} ({{ roleLabel }})
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      <main class="content-area">
        <router-view v-slot="{ Component }">
          <transition name="fade-transform" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const isCollapsed = ref(false)

const ENV_MAP = { development: '开发环境', test: '测试环境', production: '生产环境' }
const currentEnv = ref(localStorage.getItem('currentEnvironment') || 'development')
const envLabel = computed(() => ENV_MAP[currentEnv.value] || currentEnv.value)

const handleEnvChange = (env) => {
  currentEnv.value = env
  localStorage.setItem('currentEnvironment', env)
  window.location.reload()
}

const userInfo = computed(() => {
  try { return JSON.parse(localStorage.getItem('userInfo') || '{}') } catch { return {} }
})

const activeMenu = computed(() => route.meta.activeMenu || route.path)
const userRole = computed(() => userInfo.value?.role || 'viewer')
const roleLabel = computed(() => {
  const map = { admin: '管理员', editor: '编辑者', viewer: '查看者' }
  return map[userInfo.value?.role] || '用户'
})

const handleCommand = (cmd) => {
  if (cmd === 'logout') {
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    router.push('/login')
  }
}
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.sidebar {
  width: 240px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  flex-shrink: 0;
}
.sidebar.collapsed {
  width: 64px;
}
.sidebar-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  overflow: hidden;
}
.collapsed .sidebar-header {
  justify-content: center;
  padding: 0;
}
.collapsed .logo-area {
  display: none;
}
.logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}
.logo-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--gradient-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}
.logo-text {
  font-size: 16px;
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
}
.collapse-btn {
  cursor: pointer;
  color: var(--text-secondary);
  transition: var(--transition);
  flex-shrink: 0;
  font-size: 18px;
}
.collapse-btn:hover {
  color: var(--primary);
}
.sidebar-menu {
  flex: 1;
  padding: 12px 8px;
  overflow-y: auto;
}
.sidebar-menu .el-menu-item,
.sidebar-menu :deep(.el-sub-menu__title) {
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
  height: 44px;
  line-height: 44px;
}
.sidebar-menu .el-menu-item:hover,
.sidebar-menu :deep(.el-sub-menu__title:hover) {
  background: var(--bg-hover) !important;
}
.sidebar-menu .el-menu-item.is-active {
  background: rgba(99, 102, 241, 0.15) !important;
  color: var(--primary-light) !important;
}
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--gradient-bg);
}
.topbar {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: rgba(30, 41, 59, 0.6);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.breadcrumb-area :deep(.el-breadcrumb__inner) {
  color: var(--text-secondary) !important;
}
.breadcrumb-area :deep(.el-breadcrumb__inner.is-link) {
  color: var(--text-secondary) !important;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: var(--transition);
}
.user-info:hover {
  background: var(--bg-hover);
}
.username {
  font-size: 14px;
  color: var(--text-primary);
}
.env-selector {
  margin-right: 16px;
}
.env-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: var(--transition);
  border: 1px solid transparent;
}
.env-badge:hover {
  background: var(--bg-hover);
}
.env-badge.development { color: #67C23A; border-color: rgba(103, 194, 58, 0.3); }
.env-badge.test { color: #E6A23C; border-color: rgba(230, 162, 60, 0.3); }
.env-badge.production { color: #F56C6C; border-color: rgba(245, 108, 108, 0.3); }
.env-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.env-badge.development .env-dot { background: #67C23A; }
.env-badge.test .env-dot { background: #E6A23C; }
.env-badge.production .env-dot { background: #F56C6C; }
.env-dot.development { background: #67C23A; }
.env-dot.test { background: #E6A23C; }
.env-dot.production { background: #F56C6C; }
.content-area {
  flex: 1;
  overflow: hidden;
}
.fade-transform-enter-active,
.fade-transform-leave-active {
  transition: all 0.3s;
}
.fade-transform-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.fade-transform-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
