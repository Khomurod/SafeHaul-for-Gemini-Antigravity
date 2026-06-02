import React from 'react';
import ReactDOM from 'react-dom/client';
import SignatureApp from './SignatureApp.jsx';
import '../index.css';

ReactDOM.createRoot(document.getElementById('telegram-root')).render(
  <React.StrictMode>
    <SignatureApp />
  </React.StrictMode>,
);
