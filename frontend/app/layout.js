// Ersatz für die lizenzpflichtige Hausschrift Gotham HTF – lokal eingebunden (kein Google-Fonts-Abruf)
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import AppHeader from "@/components/AppHeader";

export const metadata = {
  title: "Solar-Ausbaurechner Pforzheim",
  description: "Prognose der Energiegewinnung durch Photovoltaik in Pforzheim",
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <AppHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
