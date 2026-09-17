import { RecoveryForm } from "@/components/recovery-form";
export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; expired?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="recovery-page">
      <RecoveryForm
        completing={params.step === "complete"}
        expired={params.expired === "1"}
      />
    </main>
  );
}
