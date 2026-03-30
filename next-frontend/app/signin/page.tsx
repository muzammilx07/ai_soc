"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Input } from "@/components/ui";

export default function SignInPage() {
  const { status } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("analyst");
  const [password, setPassword] = useState("analyst123");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/instances");
    }
  }, [router, status]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use demo credentials or Google OAuth if configured.
        </p>

        <div className="mb-3 mt-5 grid gap-3">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <Button
            onClick={async () => {
              if (isSubmitting) {
                return;
              }

              setError("");
              setIsSubmitting(true);

              try {
                const callbackUrl = `${window.location.origin}/instances`;

                const result = await signIn("credentials", {
                  username,
                  password,
                  callbackUrl,
                  redirect: false,
                });

                if (!result?.ok || result.error) {
                  setError("Invalid credentials. Try analyst / analyst123");
                  return;
                }

                const target = result.url || "/instances";
                if (target.startsWith("http")) {
                  window.location.assign(target);
                  return;
                }

                router.replace(target);
                router.refresh();
              } catch {
                setError("Sign-in failed. Please try again.");
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Continue with Demo Access"}
          </Button>
        </div>

        {googleEnabled ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signIn("google", { callbackUrl: "/instances" })}
          >
            Continue with Google
          </Button>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        ) : null}
      </section>
    </main>
  );
}
