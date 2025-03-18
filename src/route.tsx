import { createBrowserRouter } from 'react-router-dom';
import DialogPage from './pages/DialogPage';
import ArticleOptimizationPage from './pages/ArticleOptimizationPage';
import App from './App';
import ErrorHandler from './components/ErrorHandler';
const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        errorElement: <ErrorHandler />,
        children: [
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