import { ChatContainer } from '@/components/chat';

export const metadata = {
  title: "Histoire d'Enghien — Chat RAG",
  description: "Interrogez le livre 'Histoire de la ville d'Enghien' d'Ernest Matthieu (1876)",
};

export default function EnghienChatPage() {
  return (
    <main className="h-screen">
      <ChatContainer />
    </main>
  );
}
