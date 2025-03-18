import { createBrowserRouter } from 'react-router-dom';
import HomePage from './pages/HomePage';
import DialogPage from './pages/DialogPage';
import ArticleOptimizationPage from './pages/ArticleOptimizationPage';

const router = createBrowserRouter([
    {
        path: '/',
        children: [
            {
                index: true,
                element: <HomePage />
            },
            {
                path: 'dialog',
                element: <DialogPage />
            },
            {
                path: 'article-optimization',
                element: <ArticleOptimizationPage />
            }
        ]
    }
]);

export default router;