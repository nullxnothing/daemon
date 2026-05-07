import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export function useSeekerNotifications() {
  const [enabled, setEnabled] = useState(false)
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [lastNotificationError, setLastNotificationError] = useState<string | null>(null)

  const requestNotifications = useCallback(async () => {
    try {
      const existing = await Notifications.getPermissionsAsync()
      const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync()
      const granted = permission.granted || permission.status === 'granted'
      setEnabled(granted)

      if (!granted) {
        setLastNotificationError('Notifications are disabled')
        return { ok: false, error: 'Notifications are disabled' }
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('daemon-seeker', {
          name: 'Daemon Seeker',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 180, 120, 180],
          lightColor: '#14F195',
        })
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as any).easConfig?.projectId ??
        null

      if (projectId && projectId !== 'daemon-seeker-local') {
        try {
          const token = await Notifications.getExpoPushTokenAsync({ projectId })
          setExpoPushToken(token.data)
        } catch {
          // Push tokens require an EAS project ID. Local notifications still work without one.
        }
      }

      setLastNotificationError(null)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notification setup failed'
      setLastNotificationError(message)
      return { ok: false, error: message }
    }
  }, [])

  const notifyApprovalWaiting = useCallback(async (count: number) => {
    if (count <= 0) return
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daemon approval waiting',
        body: `${count} agent action${count === 1 ? '' : 's'} need review on Seeker.`,
        data: { route: 'approvals' },
      },
      trigger: null,
    })
  }, [])

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((permission) => setEnabled(permission.granted || permission.status === 'granted'))
      .catch(() => {})
  }, [])

  return {
    enabled,
    expoPushToken,
    lastNotificationError,
    requestNotifications,
    notifyApprovalWaiting,
  }
}
