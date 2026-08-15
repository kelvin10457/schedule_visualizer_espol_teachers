import Combobox from "./Combobox";

interface SearchableSelectProps {
    options: string[];
    value: string; // "ALL" o uno de options
    onChange: (value: string) => void;
    allLabel: string;
    width?: number;
}

// Filtro con autocompletado usado en Schedule.tsx (Tipo / Nivel / Profesor).
// Envoltorio de Combobox con una opción fija "Todos los X" y sin permitir valores libres.
export default function SearchableSelect({ options, value, onChange, allLabel, width = 220 }: SearchableSelectProps) {
    return (
        <Combobox
            options={options}
            value={value}
            onChange={onChange}
            placeholder={allLabel}
            width={width}
            allowCustom={false}
            pinnedOption={{ label: allLabel, value: "ALL" }}
        />
    );
}
