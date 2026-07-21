import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./layout/AdminLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Skins from "./pages/Skins";
import Pets from "./pages/Pets";
import Categories from "./pages/Categories";
import Adapters from "./pages/Adapters";
import Releases from "./pages/Releases";
import Users from "./pages/Users";
import Telemetry from "./pages/Telemetry";

function RequireAuth({ children }: { children: JSX.Element }) {
  if (!localStorage.getItem("codress.admin.token")) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="skins" element={<Skins />} />
          <Route path="pets" element={<Pets />} />
          <Route path="categories" element={<Categories />} />
          <Route path="adapters" element={<Adapters />} />
          <Route path="releases" element={<Releases />} />
          <Route path="users" element={<Users />} />
          <Route path="telemetry" element={<Telemetry />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
