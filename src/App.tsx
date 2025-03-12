import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import './App.css'
import ribbon from './wpsjs'
import router from './route'

function App() {
  useEffect(() => {
    window.ribbon = ribbon;
  })

  return <RouterProvider router={router} />;
}

export default App
