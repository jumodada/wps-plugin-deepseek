import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history:  createWebHashHistory(''),
  routes: [
    {
      path: '/',
      name: '默认页',
    },
    {
      path: '/article-optimization',
      name: '文章优化',
      component: () => import('../pages/ArticleOptimizationPage.vue')
    },
    {
      path: '/selection-optimization',
      name: '选中文本优化',
      component: () => import('../pages/SelectionOptimizationPage.vue')
    },
    {
      path: '/article-format',
      name: '文章格式化',
      component: () => import('../pages/ArticleFormatPage.vue')
    },
    {
      path: '/word-correction',
      name: '文章词语纠错',
      component: () => import('../pages/WordCorrectionPage.vue')
    },
  ]
})

export default router
