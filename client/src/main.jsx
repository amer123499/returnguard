import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { MetaProvider } from './meta.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <MetaProvider>
        <App />
      </MetaProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
