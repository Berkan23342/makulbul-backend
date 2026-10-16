// withUIScene.js — iOS 27 SDK ile derlenen uygulamalar UIScene yaşam döngüsünü KULLANMAK ZORUNDA;
// Expo'nun varsayılan AppDelegate'i pencereyi kendisi oluşturuyor ve açılışta
// "UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption" ile çöküyor (EXC_BREAKPOINT).
// Bu eklenti: (1) Info.plist'e sahne manifestini ekler, (2) AppDelegate.swift'ten pencere oluşturmayı
// kaldırıp bir SceneDelegate sınıfı ekler (pencere + React Native burada başlar).
// Expo SDK'sı bunu resmen destekleyince bu dosya silinebilir.
const { withInfoPlist, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SCENE_DELEGATE = `
// --- UIScene yaşam döngüsü (iOS 27 SDK zorunluluğu; plugins/withUIScene.js) ---
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    appDelegate.reactNativeFactory?.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
    if let url = connectionOptions.urlContexts.first?.url {
      _ = RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    _ = RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

module.exports = function withUIScene(config) {
  config = withInfoPlist(config, c => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' },
        ],
      },
    };
    return c;
  });
  return withDangerousMod(config, ['ios', async c => {
    const dir = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName);
    const file = path.join(dir, 'AppDelegate.swift');
    let src = fs.readFileSync(file, 'utf8');
    if (src.includes('class SceneDelegate')) return c;           // zaten uygulanmış
    const start = src.indexOf('#if os(iOS) || os(tvOS)\n    window = UIWindow(frame');
    const end = src.indexOf('    return super.application(application, didFinishLaunchingWithOptions: launchOptions)');
    if (start === -1 || end === -1) throw new Error('withUIScene: AppDelegate.swift beklenen yapıda değil; Expo sürümü değişmiş olabilir.');
    src = src.slice(0, start) + '    // UIScene: pencere ve React Native başlatma SceneDelegate\'te\n\n' + src.slice(end) + SCENE_DELEGATE;
    fs.writeFileSync(file, src);
    return c;
  }]);
};
