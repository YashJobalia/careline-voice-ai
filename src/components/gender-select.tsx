const options = ["Female", "Male", "Non-binary", "Other", "Prefer not to say"];

export function GenderSelect({ value = "" }: { value?: string | null }) {
  return (
    <select name="gender" defaultValue={value || ""}>
      <option value="">Select gender (optional)</option>
      {value && !options.includes(value) && (
        <option value={value}>{value}</option>
      )}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
