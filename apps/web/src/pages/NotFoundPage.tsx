import { ArrowLeft, WineOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

export const NotFoundPage = () => (
  <Card className="mx-auto max-w-2xl py-16 text-center">
    <CardContent className="flex flex-col items-center gap-4">
      <WineOff className="size-10 text-primary" />
      <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">404</p>
      <h1 className="font-serif text-4xl sm:text-5xl">This page isn’t in the cellar.</h1>
      <p className="max-w-md text-muted-foreground">
        The link may be old, or the wine or monopoly may no longer exist.
      </p>
      <Button asChild className="mt-3">
        <Link to="/">
          <ArrowLeft /> Return to overview
        </Link>
      </Button>
    </CardContent>
  </Card>
);
