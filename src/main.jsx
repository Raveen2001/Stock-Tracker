import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './module_bindings/index.ts';

const HOST = import.meta.env.VITE_STDB_HOST ?? 'ws://127.0.0.1:3001';
const DB_NAME = import.meta.env.VITE_STDB_NAME ?? 'stock-tracker';
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect((_conn, _identity, token) => {
    localStorage.setItem(TOKEN_KEY, token);
  })
  .onDisconnect(() => {
    console.log('Disconnected from SpacetimeDB');
  })
  .onConnectError((_ctx, err) => {
    console.error('SpacetimeDB connection error:', err);
  });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </React.StrictMode>
);
