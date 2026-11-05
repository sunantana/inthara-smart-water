import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './App.routes';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
