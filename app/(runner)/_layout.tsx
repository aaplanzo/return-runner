import { Stack } from 'expo-router';

export default function RunnerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="job-ping" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      <Stack.Screen name="navigate-pickup" />
      <Stack.Screen name="arrive-pickup" />
      <Stack.Screen name="navigate-dropoff" />
      <Stack.Screen name="arrive-dropoff" />
      <Stack.Screen name="job-complete" options={{ animation: 'fade' }} />
    </Stack>
  );
}
