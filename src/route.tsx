import { createBrowserRouter } from 'react-router-dom';
import HomePage from './pages/HomePage';
import DialogPage from './pages/DialogPage';

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
            }
        ]
    }
]);

export default router;