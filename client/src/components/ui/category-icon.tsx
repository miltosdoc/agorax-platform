import React from 'react';
import {
  Gavel,
  BarChart,
  Building,
  Landmark,
  CheckCircle,
  TreePine,
  BadgeDollarSign,
  Users,
  Scale,
  GraduationCap,
  Stethoscope,
  Palette,
  Network,
  Target,
  MoreHorizontal,
  Globe,
  Microscope,
  Atom,
  Binary,
  Cpu,
  Database,
  Lightbulb,
  VoteIcon,
  FileText,
  Group,
  Star,
  ShieldCheck,
  Rocket,
  CloudCog,
  Briefcase,
  Factory
} from 'lucide-react';

// Define the icons for each category
const categoryIconMap: Record<string, React.ReactNode> = {
  // Politics & Democracy
  "Πολιτική": <Landmark className="h-4 w-4" />,
  "Τοπική Αυτοδιοίκηση": <Building className="h-4 w-4" />,
  "Νομοθεσία": <Gavel className="h-4 w-4" />,
  "Δημόσια Διοίκηση": <Globe className="h-4 w-4" />,
  "Εκλογές": <CheckCircle className="h-4 w-4" />,
  "Προϋπολογισμός": <BarChart className="h-4 w-4" />,
  "Δημοκρατία": <VoteIcon className="h-4 w-4" />,
  "Διαφάνεια": <FileText className="h-4 w-4" />,
  "Συμμετοχή": <Group className="h-4 w-4" />,
  "Ευρωπαϊκή Ένωση": <Star className="h-4 w-4" />,
  
  // Economy & Society
  "Περιβάλλον": <TreePine className="h-4 w-4" />,
  "Οικονομία": <BadgeDollarSign className="h-4 w-4" />,
  "Κοινωνία": <Users className="h-4 w-4" />,
  "Δικαιοσύνη": <Scale className="h-4 w-4" />,
  "Παιδεία": <GraduationCap className="h-4 w-4" />,
  "Υγεία": <Stethoscope className="h-4 w-4" />,
  "Ασφάλεια": <ShieldCheck className="h-4 w-4" />,
  
  // Science & Technology
  "Τεχνολογία": <Cpu className="h-4 w-4" />,
  "Επιστήμη": <Microscope className="h-4 w-4" />,
  "Καινοτομία": <Lightbulb className="h-4 w-4" />,
  "Φυσική": <Atom className="h-4 w-4" />,
  "Πληροφορική": <Binary className="h-4 w-4" />,
  "Τεχνητή Νοημοσύνη": <Binary className="h-4 w-4" />,
  "Διάστημα": <Rocket className="h-4 w-4" />,
  "Δεδομένα": <Database className="h-4 w-4" />,
  "Υπολογιστικό Νέφος": <CloudCog className="h-4 w-4" />,
  
  // Culture & Infrastructure
  "Πολιτισμός": <Palette className="h-4 w-4" />,
  "Υποδομές": <Network className="h-4 w-4" />,
  "Στρατηγικός Σχεδιασμός": <Target className="h-4 w-4" />,
  "Βιομηχανία": <Factory className="h-4 w-4" />,
  "Επιχειρήσεις": <Briefcase className="h-4 w-4" />,
  
  // Other
  "Άλλο": <MoreHorizontal className="h-4 w-4" />
};

interface CategoryIconProps {
  category: string;
  className?: string;
}

export function CategoryIcon({ category, className = "" }: CategoryIconProps) {
  // Get the icon for the category, or use the default if not found
  const icon = categoryIconMap[category] || <MoreHorizontal className="h-4 w-4" />;
  
  return (
    <div className={`text-primary ${className}`}>
      {icon}
    </div>
  );
}