import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';

export default function RegrasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background-light dark:bg-background-dark">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden relative">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
