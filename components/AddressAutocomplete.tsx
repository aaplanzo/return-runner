import { View, Text, StyleSheet } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

// Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in your .env file.
// Get a key at https://console.cloud.google.com → APIs & Services →
// Enable "Places API" and "Maps SDK for Android/iOS", then restrict
// the key to your app's bundle ID.
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

interface Props {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  // Called on dropdown selection (lat/lng available) OR on free-text change (lat/lng undefined)
  onSelect: (address: string, lat?: number, lng?: number) => void;
}

export function AddressAutocomplete({
  label,
  placeholder = '123 Main St, City, State, ZIP',
  defaultValue = '',
  onSelect,
}: Props) {
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      {/* zIndex required so the dropdown floats over sibling form fields */}
      <View style={styles.autocompleteContainer}>
        <GooglePlacesAutocomplete
          placeholder={placeholder}
          onPress={(data, details) => {
            const address = data.description;
            const lat = details?.geometry?.location?.lat;
            const lng = details?.geometry?.location?.lng;
            onSelect(address, lat, lng);
          }}
          query={{
            key: GOOGLE_MAPS_KEY,
            language: 'en',
            components: 'country:us',
            types: 'address',
          }}
          fetchDetails
          enablePoweredByContainer={false}
          minLength={2}
          debounce={300}
          keepResultsAfterBlur={false}
          textInputProps={{
            defaultValue,
            placeholderTextColor: Colors.textSecondary,
            // Capture free-form typing so parent state stays in sync
            // even when user doesn't pick a suggestion
            onChangeText: (text) => onSelect(text),
          }}
          renderRow={(data) => (
            <View style={styles.suggestionRow}>
              <Text style={styles.suggestionMain} numberOfLines={1}>
                {data.structured_formatting?.main_text ?? data.description}
              </Text>
              {data.structured_formatting?.secondary_text ? (
                <Text style={styles.suggestionSub} numberOfLines={1}>
                  {data.structured_formatting.secondary_text}
                </Text>
              ) : null}
            </View>
          )}
          styles={{
            container: { flex: 0 },
            textInputContainer: styles.textInputContainer,
            textInput: styles.textInput,
            listView: styles.listView,
            row: styles.row,
            separator: styles.separator,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
    // zIndex so dropdown appears above fields below this one in the form
    zIndex: 10,
  },
  label: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  autocompleteContainer: {
    zIndex: 10,
  },

  // ── GooglePlacesAutocomplete styles ─────────────────────────────────────────

  textInputContainer: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderBottomWidth: 0,
    padding: 0,
    margin: 0,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 15,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: Colors.textPrimary,
    height: 52,
    marginBottom: 0,
  },
  listView: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.card,
    marginTop: 4,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  row: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
    opacity: 0.6,
  },

  // ── Custom suggestion row ────────────────────────────────────────────────────

  suggestionRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    gap: 2,
  },
  suggestionMain: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  suggestionSub: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
