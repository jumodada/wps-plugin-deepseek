import { createBrowserRouter } from 'react-router-dom';
import DialogPage from './pages/DialogPage';
import ArticleOptimizationPage from './pages/ArticleOptimizationPage';
import SelectionOptimizationPage from './pages/SelectionOptimizationPage';
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
            },
            {
                path: 'selection-optimization',
                element: <SelectionOptimizationPage />
            }
        ]
    }
]);

export default router;