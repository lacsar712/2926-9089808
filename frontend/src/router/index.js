import { createRouter, createWebHistory } from 'vue-router'

const routes = [
    {
        path: '/login',
        name: 'Login',
        component: () => import('@/views/Login.vue'),
        meta: { title: '登录', hideLayout: true }
    },
    {
        path: '/',
        component: () => import('@/layout/AppLayout.vue'),
        redirect: '/pipeline',
        children: [
            {
                path: 'pipeline',
                name: 'Pipeline',
                component: () => import('@/views/pipeline/PipelineList.vue'),
                meta: { title: '生产线管理', icon: 'Operation' }
            },
            {
                path: 'pipeline/flow/:id',
                name: 'PipelineFlow',
                component: () => import('@/views/pipeline/PipelineFlow.vue'),
                meta: { title: '生产线编排', icon: 'Share', activeMenu: '/pipeline' }
            },
            {
                path: 'pipeline/trash',
                name: 'PipelineTrash',
                component: () => import('@/views/pipeline/PipelineTrash.vue'),
                meta: { title: '回收站', icon: 'Delete', activeMenu: '/pipeline' }
            },
            {
                path: 'monitor',
                name: 'Monitor',
                component: () => import('@/views/monitor/MonitorDashboard.vue'),
                meta: { title: '生产线监控', icon: 'DataLine' }
            },
            {
                path: 'monitor/detail/:id',
                name: 'MonitorDetail',
                component: () => import('@/views/monitor/MonitorDetail.vue'),
                meta: { title: '监控详情', icon: 'View', activeMenu: '/monitor' }
            },
            {
                path: 'monitor/bookmarks',
                name: 'MonitorBookmarks',
                component: () => import('@/views/monitor/MonitorBookmarks.vue'),
                meta: { title: '我的收藏', icon: 'Star', activeMenu: '/monitor' }
            },
            {
                path: 'alert',
                name: 'Alert',
                component: () => import('@/views/alert/AlertView.vue'),
                meta: { title: '告警规则', icon: 'Bell' }
            },
            {
                path: 'lineage',
                name: 'Lineage',
                component: () => import('@/views/lineage/LineageView.vue'),
                meta: { title: '数据血缘', icon: 'Connection' }
            },
            {
                path: 'system/user',
                name: 'SystemUser',
                component: () => import('@/views/system/UserManage.vue'),
                meta: { title: '用户管理', icon: 'User' }
            },
            {
                path: 'system/tag',
                name: 'SystemTag',
                component: () => import('@/views/system/TagManage.vue'),
                meta: { title: '标签管理', icon: 'PriceTag' }
            },
            {
                path: 'system/environment',
                name: 'SystemEnvironment',
                component: () => import('@/views/system/EnvironmentView.vue'),
                meta: { title: '环境管理', icon: 'Monitor' }
            },
            {
                path: 'system/log',
                name: 'SystemLog',
                component: () => import('@/views/system/LogManage.vue'),
                meta: { title: '操作日志', icon: 'Document' }
            },
            {
                path: 'system/quota',
                name: 'SystemQuota',
                component: () => import('@/views/system/QuotaManage.vue'),
                meta: { title: '资源配额', icon: 'Odometer' }
            },
            {
                path: 'settings/api-keys',
                name: 'SettingsApiKeys',
                component: () => import('@/views/settings/ApiKeysView.vue'),
                meta: { title: 'API 密钥', icon: 'Key' }
            },
            {
                path: 'presets',
                name: 'Presets',
                component: () => import('@/views/preset/PresetView.vue'),
                meta: { title: '参数预设库', icon: 'SetUp' }
            },
            {
                path: 'approval',
                name: 'Approval',
                component: () => import('@/views/approval/ApprovalView.vue'),
                meta: { title: '发布审批', icon: 'Check', roles: ['admin'] }
            },
            {
                path: 'approval/mine',
                name: 'MyApproval',
                component: () => import('@/views/approval/MyApproval.vue'),
                meta: { title: '我的申请', icon: 'Document', roles: ['admin', 'editor'] }
            },
            {
                path: 'help',
                name: 'Help',
                component: () => import('@/views/help/HelpCenter.vue'),
                meta: { title: '帮助中心', icon: 'QuestionFilled' }
            },
            {
                path: 'system/help',
                name: 'SystemHelp',
                component: () => import('@/views/system/HelpManage.vue'),
                meta: { title: '帮助管理', icon: 'Reading', roles: ['admin'] }
            }
        ]
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

router.beforeEach((to, _from, next) => {
    document.title = `${to.meta.title || '数据生产线'} - 数据生产线可视化平台`
    if (to.path !== '/login' && !localStorage.getItem('token')) {
        next('/login')
    } else if (to.meta.roles) {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
        if (!to.meta.roles.includes(userInfo.role)) {
            next('/')
        } else {
            next()
        }
    } else {
        next()
    }
})

export default router
