import { Image, View } from 'react-native';

import { brandAssets } from './assets';
import { BRAND } from './brand';

/**
 * The warm cream paper, identical on both intro screens and the loading screen, so nothing
 * changes colour during a swipe. The flat colour paints first; the grain tile sits on top.
 */
export function PaperBackground() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        backgroundColor: BRAND.paper,
      }}
    >
      <Image
        source={brandAssets.paper}
        resizeMode="cover"
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      />
    </View>
  );
}
