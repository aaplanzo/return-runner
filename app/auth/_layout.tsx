import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="signup-email" />
      <Stack.Screen name="login" />
      <Stack.Screen name="oauth-confirm" />
    </Stack>
  );
}
