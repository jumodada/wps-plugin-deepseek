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
  ]
})

export default router
