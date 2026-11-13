import { SignIn } from "@clerk/nextjs";

import { AuthShell } from "@/components/layout/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn />
    </AuthShell>
  );
}
