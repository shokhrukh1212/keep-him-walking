import { notFound } from "next/navigation";
import { CharacterReview } from "@/components/traveler/CharacterReview";

export default function CharacterReviewPage() {
  if (process.env.VERCEL_ENV === "production" ||
      (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview")) {
    notFound();
  }
  return <CharacterReview />;
}
