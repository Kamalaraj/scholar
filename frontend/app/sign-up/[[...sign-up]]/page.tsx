import { SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/layout/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp />
    </AuthShell>
  );
}
