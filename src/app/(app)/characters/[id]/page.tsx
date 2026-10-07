import { redirect } from "next/navigation";

// Character sheets were replaced by the album; old links land on the album.
export default function OldCharacterPage() {
  redirect("/characters");
}
