import { ChatContainer } from '@/components/chat';

export const metadata = {
  title: "Histoire d'Enghien — Bibliothèque historique",
  description: "Interrogez huit ouvrages de référence sur l'histoire d'Enghien et de Petit-Enghien (1876-2007) : Matthieu, Reygaerts, Godet et les Cahiers de Petit-Enghien.",
};

export default function EnghienChatPage() {
  return (
    <main className="h-screen">
      <ChatContainer />
    </main>
  );
}
