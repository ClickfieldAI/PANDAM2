import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconFrame, ListRow, Sheet, Stack, useThemeColors } from '@pandam/ui';

/** What the composer's attach (+) button offers. */
export function AttachmentMenu({
  visible,
  onClose,
  onPickMedia,
  onShareLocation,
}: {
  visible: boolean;
  onClose: () => void;
  /** Photo or video from the device gallery. */
  onPickMedia: () => void;
  onShareLocation: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <Sheet visible={visible} onClose={onClose} title="Attach" bottomInset={insets.bottom}>
      <Stack gap="sm" style={{ paddingBottom: 16 }}>
        <ListRow
          title="Photo or video"
          subtitle="Choose from your gallery"
          leading={
            <IconFrame>
              <Ionicons name="images-outline" size={22} color={colors.accent} />
            </IconFrame>
          }
          onPress={() => {
            onClose();
            onPickMedia();
          }}
        />
        <ListRow
          title="Share location"
          subtitle="Send where you are right now"
          leading={
            <IconFrame>
              <Ionicons name="location-outline" size={22} color={colors.accent} />
            </IconFrame>
          }
          onPress={() => {
            onClose();
            onShareLocation();
          }}
        />
      </Stack>
    </Sheet>
  );
}
