import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail } from "lucide-react";
import { Link } from "wouter";

export default function UpgradePage() {
  return (
    <div className="h-full overflow-auto p-6 flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold" data-testid="upgrade-title">
            Upgrade to Live Detection
          </h1>
          <p className="text-sm text-muted-foreground">
            Stripe integration coming in Sprint 6. Contact us to upgrade your plan and connect live traffic to your transformer.
          </p>
          <div className="pt-2 space-y-2">
            <Button variant="default" className="w-full" disabled data-testid="btn-stripe-checkout">
              Stripe Checkout — Sprint 6
            </Button>
            <Link href="/">
              <Button variant="outline" className="w-full gap-2" data-testid="btn-back-dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
