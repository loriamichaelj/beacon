import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import IncidentCreatePage from "./pages/incidents/IncidentCreatePage";
import IncidentDetailPage from "./pages/incidents/IncidentDetailPage";
import IncidentListPage from "./pages/incidents/IncidentListPage";
import NotFoundPage from "./pages/NotFoundPage";
import OverviewPage from "./pages/OverviewPage";
import ServiceCreatePage from "./pages/services/ServiceCreatePage";
import ServiceDetailPage from "./pages/services/ServiceDetailPage";
import ServiceEditPage from "./pages/services/ServiceEditPage";
import ServiceListPage from "./pages/services/ServiceListPage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/services" element={<ServiceListPage />} />
        <Route path="/services/new" element={<ServiceCreatePage />} />
        <Route path="/services/:id" element={<ServiceDetailPage />} />
        <Route path="/services/:id/edit" element={<ServiceEditPage />} />
        <Route path="/incidents" element={<IncidentListPage />} />
        <Route path="/incidents/new" element={<IncidentCreatePage />} />
        <Route path="/incidents/:id" element={<IncidentDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
