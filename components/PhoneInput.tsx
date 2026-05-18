import { TextInput, type TextInputProps } from 'react-native';

// Format a string of digits into (xxx) xxx-xxxx as the user types.
// Accepts the full current value (formatted or raw) and returns the
// re-formatted string, so parents can store the formatted value in state.
export function formatPhone(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

interface PhoneInputProps extends Omit<TextInputProps, 'onChangeText'> {
  value: string;
  onChangeText: (formatted: string) => void;
}

export function PhoneInput({ value, onChangeText, ...props }: PhoneInputProps) {
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChangeText(formatPhone(text))}
      keyboardType="phone-pad"
      autoComplete="tel"
      maxLength={14} // "(xxx) xxx-xxxx"
      {...props}
    />
  );
}
