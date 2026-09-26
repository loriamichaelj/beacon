import { Link, useNavigate } from "react-router-dom";

import { useCreateService } from "../../api/services";
import { Icon } from "../../components/Icon";
import { ServiceForm } from "../../components/ServiceForm";
import { useToast } from "../../components/toastContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import type { ServiceFormValues } from "../../schemas/service";

export default function ServiceCreatePage() {
  useDocumentTitle("New service");
  const navigate = useNavigate();
  const toast = useToast();
  const createService = useCreateService();

  async function handleSubmit(values: ServiceFormValues) {
    const created = await createService.mutateAsync({
      name: values.name,
      tier: values.tier,
      owner_team: values.owner_team,
      runbook_url: values.runbook_url || null,
      description: values.description || null,
    });
    toast.show({ tone: "success", message: `Created ${created.name}.` });
    navigate(`/services/${created.id}`);
    return created;
  }

  return (
    <section className="page page-narrow">
      <Link to="/services" className="back-link">
        <Icon name="back" />
        Services
      </Link>
      <div className="page-header">
        <div>
          <h1>New service</h1>
          <p className="page-subtitle">Register a service so incidents can be raised against it.</p>
        </div>
      </div>
      <ServiceForm submitLabel="Create service" onSubmit={handleSubmit} cancelTo="/services" />
    </section>
  );
}
