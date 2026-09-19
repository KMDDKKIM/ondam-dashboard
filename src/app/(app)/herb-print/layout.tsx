import HerbPrintNav from "@/components/herb-print/HerbPrintNav";
import "./herb-print.css";

export default function HerbPrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="herb-print-app">
      <HerbPrintNav />
      {children}
    </div>
  );
}
