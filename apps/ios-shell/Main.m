#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <AVFoundation/AVFoundation.h>
#import <QuartzCore/QuartzCore.h>
#import <sys/socket.h>
#import <netinet/in.h>
#import <fcntl.h>
#import <unistd.h>
#import <errno.h>

static NSString *JSONString(id object) {
    NSData *data=[NSJSONSerialization dataWithJSONObject:object options:NSJSONWritingFragmentsAllowed error:nil];
    return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
}

// Serve packaged assets on loopback only. Ordinary HTTP origin preserves the web clients'
// root-relative URLs, localStorage, fetch, WebSocket and history behavior.
@interface AssetServer : NSObject
@property(nonatomic,strong) dispatch_source_t source;
@property(nonatomic,copy) NSString *root;
@property(nonatomic) int port;
-(BOOL)start:(NSError **)error;
-(void)serve:(int)client;
@end
@implementation AssetServer
-(BOOL)start:(NSError **)error {
    int fd=socket(AF_INET,SOCK_STREAM,0); if(fd<0)return NO;
    int one=1;setsockopt(fd,SOL_SOCKET,SO_REUSEADDR,&one,sizeof(one));
    struct sockaddr_in address={0};address.sin_len=sizeof(address);address.sin_family=AF_INET;
    address.sin_port=htons(self.port);address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    if(bind(fd,(struct sockaddr *)&address,sizeof(address))<0||listen(fd,16)<0){
        if(error)*error=[NSError errorWithDomain:NSPOSIXErrorDomain code:errno userInfo:nil];close(fd);return NO;
    }
    fcntl(fd,F_SETFL,O_NONBLOCK);
    dispatch_queue_t queue=dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0);
    self.source=dispatch_source_create(DISPATCH_SOURCE_TYPE_READ,fd,0,queue);
    __weak AssetServer *weak=self;
    dispatch_source_set_event_handler(self.source,^{
        int client;
        while((client=accept(fd,NULL,NULL))>=0){
            AssetServer *server=weak;
            if(!server){close(client);continue;}
            dispatch_async(queue,^{[server serve:client];});
        }
    });
    dispatch_source_set_cancel_handler(self.source,^{close(fd);});dispatch_resume(self.source);return YES;
}
-(void)serve:(int)client {
    @autoreleasepool {
        int one=1;setsockopt(client,SOL_SOCKET,SO_NOSIGPIPE,&one,sizeof(one));
        int flags=fcntl(client,F_GETFL,0);if(flags>=0)fcntl(client,F_SETFL,flags&~O_NONBLOCK);
        struct timeval timeout={3,0};setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));
        NSMutableData *request=[NSMutableData data];char buffer[2048];ssize_t n;
        while(request.length<16384&&(n=recv(client,buffer,sizeof(buffer),0))>0){
            [request appendBytes:buffer length:n];
            if([request rangeOfData:[@"\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding] options:0 range:NSMakeRange(0,request.length)].location!=NSNotFound)break;
        }
        NSString *line=[[[NSString alloc] initWithData:request encoding:NSUTF8StringEncoding] componentsSeparatedByString:@"\r\n"].firstObject;
        NSArray *parts=[line componentsSeparatedByString:@" "];
        NSString *method=parts.count>0?parts[0]:@"";
        NSString *target=parts.count>1?parts[1]:@"";
        NSString *route=[[[target componentsSeparatedByString:@"?"].firstObject componentsSeparatedByString:@"#"].firstObject stringByRemovingPercentEncoding];
        if([route isEqualToString:@"/"])route=@"/login.html";
        BOOL allowed=([method isEqualToString:@"GET"]||[method isEqualToString:@"HEAD"])&&[route hasPrefix:@"/"]&&![route containsString:@".."]&&![route containsString:@"\\"]&&[route rangeOfString:[NSString stringWithFormat:@"%C",(unichar)0]].location==NSNotFound;
        NSData *body=nil;NSString *mime=@"text/plain";
        if(allowed){
            NSString *file=[[self.root stringByAppendingPathComponent:[route substringFromIndex:1]] stringByStandardizingPath];
            if([file hasPrefix:[self.root stringByAppendingString:@"/"]])body=[NSData dataWithContentsOfFile:file];
            NSDictionary *types=@{@"html":@"text/html; charset=utf-8",@"js":@"application/javascript; charset=utf-8",@"css":@"text/css; charset=utf-8",@"json":@"application/json",@"svg":@"image/svg+xml",@"png":@"image/png",@"jpg":@"image/jpeg",@"jpeg":@"image/jpeg",@"webp":@"image/webp",@"woff2":@"font/woff2",@"woff":@"font/woff",@"ico":@"image/x-icon"};
            mime=types[route.pathExtension.lowercaseString]?:@"application/octet-stream";
            if(body&&[route isEqualToString:@"/app-config.js"]){
                NSString *base=[[NSUserDefaults standardUserDefaults] stringForKey:@"server"]?:[[NSBundle mainBundle] objectForInfoDictionaryKey:@"LaserDefaultServer"];
                NSString *prefix=[NSString stringWithFormat:@"window.LASER_API_BASE=%@;window.LASER_NATIVE_SHELL=true;\n",JSONString(base)];
                NSMutableData *combined=[[prefix dataUsingEncoding:NSUTF8StringEncoding] mutableCopy];[combined appendData:body];body=combined;
            }
        }
        int status=body?200:404;
        if(!body)body=[@"Not found" dataUsingEncoding:NSUTF8StringEncoding];
        NSString *headers=[NSString stringWithFormat:@"HTTP/1.1 %d %@\r\nContent-Type: %@\r\nContent-Length: %lu\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",status,status==200?@"OK":@"Not Found",mime,(unsigned long)body.length];
        NSMutableData *response=[[headers dataUsingEncoding:NSUTF8StringEncoding] mutableCopy];if(![method isEqualToString:@"HEAD"])[response appendData:body];
        const uint8_t *bytes=response.bytes;NSUInteger sent=0;
        while(sent<response.length){ssize_t written=send(client,bytes+sent,response.length-sent,0);if(written<=0){if(errno==EINTR)continue;break;}sent+=written;}
        close(client);
    }
}
-(void)dealloc {if(_source)dispatch_source_cancel(_source);}
@end

@interface ScannerController : UIViewController<AVCaptureMetadataOutputObjectsDelegate>
@property(nonatomic,strong)AVCaptureSession *session;
@property(nonatomic,strong)AVCaptureVideoPreviewLayer *preview;
@property(nonatomic,strong)dispatch_queue_t captureQueue;
@property(nonatomic,copy)void(^result)(NSString *);
@property(nonatomic)BOOL delivered;
@end
@implementation ScannerController
-(void)viewDidLoad {
    [super viewDidLoad];self.view.backgroundColor=UIColor.blackColor;self.captureQueue=dispatch_queue_create("laser.scanner",DISPATCH_QUEUE_SERIAL);
    self.session=[AVCaptureSession new];NSError *error=nil;
    AVCaptureDevice *camera=[AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo];
    AVCaptureDeviceInput *input=camera?[AVCaptureDeviceInput deviceInputWithDevice:camera error:&error]:nil;
    AVCaptureMetadataOutput *output=[AVCaptureMetadataOutput new];
    if(!input||![self.session canAddInput:input]||![self.session canAddOutput:output]){
        UILabel *failure=[[UILabel alloc]initWithFrame:CGRectMake(24,180,320,120)];failure.numberOfLines=0;failure.textColor=UIColor.whiteColor;failure.text=@"相机暂时无法使用，请关闭其他占用相机的应用后重试。";[self.view addSubview:failure];
    }else{
        [self.session addInput:input];[self.session addOutput:output];[output setMetadataObjectsDelegate:self queue:dispatch_get_main_queue()];output.metadataObjectTypes=@[AVMetadataObjectTypeQRCode];
        self.preview=[AVCaptureVideoPreviewLayer layerWithSession:self.session];self.preview.videoGravity=AVLayerVideoGravityResizeAspectFill;[self.view.layer addSublayer:self.preview];
    }
    UIButton *cancel=[UIButton buttonWithType:UIButtonTypeSystem];[cancel setTitle:@"取消" forState:UIControlStateNormal];[cancel setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];cancel.backgroundColor=[UIColor colorWithWhite:0 alpha:.45];cancel.layer.cornerRadius=10;cancel.translatesAutoresizingMaskIntoConstraints=NO;[cancel addTarget:self action:@selector(cancel) forControlEvents:UIControlEventTouchUpInside];[self.view addSubview:cancel];
    UILabel *tip=[UILabel new];tip.text=@"扫一扫 · 将设备二维码放入画面";tip.textColor=UIColor.whiteColor;tip.textAlignment=NSTextAlignmentCenter;tip.font=[UIFont systemFontOfSize:16 weight:UIFontWeightMedium];tip.translatesAutoresizingMaskIntoConstraints=NO;[self.view addSubview:tip];
    [NSLayoutConstraint activateConstraints:@[[cancel.leadingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor constant:20],[cancel.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:16],[cancel.widthAnchor constraintEqualToConstant:72],[cancel.heightAnchor constraintEqualToConstant:44],[tip.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],[tip.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor constant:-50]]];
}
-(void)viewDidLayoutSubviews{[super viewDidLayoutSubviews];self.preview.frame=self.view.bounds;}
-(void)viewDidAppear:(BOOL)animated{[super viewDidAppear:animated];dispatch_async(self.captureQueue,^{if(self.preview)[self.session startRunning];});}
-(void)viewWillDisappear:(BOOL)animated{[super viewWillDisappear:animated];dispatch_async(self.captureQueue,^{[self.session stopRunning];});}
-(void)cancel{[self dismissViewControllerAnimated:YES completion:nil];}
-(void)metadataOutput:(AVCaptureMetadataOutput *)output didOutputMetadataObjects:(NSArray<__kindof AVMetadataObject *> *)objects fromConnection:(AVCaptureConnection *)connection{
    if(self.delivered)return;
    for(AVMetadataMachineReadableCodeObject *object in objects){if(object.stringValue.length){self.delivered=YES;NSString *value=object.stringValue;[self dismissViewControllerAnimated:YES completion:^{if(self.result)self.result(value);}];break;}}
}
@end

@interface MainController : UIViewController<WKNavigationDelegate,WKUIDelegate,WKScriptMessageHandler>
@property(nonatomic,strong)WKWebView *web;
@property(nonatomic,strong)AssetServer *server;
@property(nonatomic,strong)UIProgressView *progress;
@property(nonatomic,strong)NSURLSessionDataTask *connectionTask;
@property(nonatomic,copy)NSString *origin;
@property(nonatomic)BOOL engineer;
@end
@implementation MainController
-(void)viewDidLoad {
    [super viewDidLoad];self.view.backgroundColor=UIColor.whiteColor;
    self.engineer=[NSBundle.mainBundle.bundleIdentifier hasSuffix:@"engineer"];
    self.server=[AssetServer new];self.server.root=[NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"web"];self.server.port=self.engineer?43102:43101;
    self.origin=[NSString stringWithFormat:@"http://127.0.0.1:%d",self.server.port];
    NSError *error=nil;
    if(![self.server start:&error]){UILabel *failure=[[UILabel alloc]initWithFrame:self.view.bounds];failure.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;failure.numberOfLines=0;failure.textAlignment=NSTextAlignmentCenter;failure.text=@"本地页面服务启动失败，请退出并重新打开应用。";[self.view addSubview:failure];return;}
    WKWebViewConfiguration *config=[WKWebViewConfiguration new];config.websiteDataStore=WKWebsiteDataStore.defaultDataStore;config.allowsInlineMediaPlayback=YES;
    NSString *scan=@"document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#open-camera')){e.preventDefault();e.stopImmediatePropagation();window.webkit.messageHandlers.nativeScan.postMessage('scan');}},true);";
    [config.userContentController addUserScript:[[WKUserScript alloc]initWithSource:scan injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:YES]];
    [config.userContentController addScriptMessageHandler:self name:@"nativeScan"];
    self.web=[[WKWebView alloc]initWithFrame:CGRectZero configuration:config];self.web.navigationDelegate=self;self.web.UIDelegate=self;self.web.translatesAutoresizingMaskIntoConstraints=NO;
    self.web.allowsBackForwardNavigationGestures=YES;self.web.scrollView.contentInsetAdjustmentBehavior=UIScrollViewContentInsetAdjustmentNever;
    UIView *bar=[UIView new];bar.translatesAutoresizingMaskIntoConstraints=NO;
    UIButton *back=[UIButton buttonWithType:UIButtonTypeSystem];[back setTitle:@"‹ 返回" forState:UIControlStateNormal];back.titleLabel.font=[UIFont systemFontOfSize:13];[back addTarget:self action:@selector(goBack) forControlEvents:UIControlEventTouchUpInside];back.translatesAutoresizingMaskIntoConstraints=NO;
    UIButton *settings=[UIButton buttonWithType:UIButtonTypeSystem];[settings setTitle:@"连接设置" forState:UIControlStateNormal];settings.titleLabel.font=[UIFont systemFontOfSize:13];[settings addTarget:self action:@selector(showSettings) forControlEvents:UIControlEventTouchUpInside];settings.translatesAutoresizingMaskIntoConstraints=NO;
    UIColor *accent=self.engineer?[UIColor colorWithRed:.08 green:.47 blue:.36 alpha:1]:[UIColor colorWithRed:.10 green:.42 blue:.88 alpha:1];[back setTitleColor:accent forState:UIControlStateNormal];[settings setTitleColor:accent forState:UIControlStateNormal];
    UILabel *label=[UILabel new];label.text=self.engineer?@"工程师 · 局域网演示":@"客户端 · 局域网演示";label.font=[UIFont systemFontOfSize:11];label.textColor=UIColor.secondaryLabelColor;label.translatesAutoresizingMaskIntoConstraints=NO;label.textAlignment=NSTextAlignmentCenter;
    [bar addSubview:back];[bar addSubview:settings];[bar addSubview:label];[self.view addSubview:bar];[self.view addSubview:self.web];
    [NSLayoutConstraint activateConstraints:@[[bar.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],[bar.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],[bar.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],[bar.heightAnchor constraintEqualToConstant:42],[back.leadingAnchor constraintEqualToAnchor:bar.leadingAnchor constant:12],[back.centerYAnchor constraintEqualToAnchor:bar.centerYAnchor],[back.heightAnchor constraintEqualToConstant:42],[back.widthAnchor constraintEqualToConstant:64],[settings.trailingAnchor constraintEqualToAnchor:bar.trailingAnchor constant:-12],[settings.centerYAnchor constraintEqualToAnchor:bar.centerYAnchor],[settings.heightAnchor constraintEqualToConstant:42],[settings.widthAnchor constraintEqualToConstant:80],[label.leadingAnchor constraintEqualToAnchor:back.trailingAnchor constant:4],[label.trailingAnchor constraintEqualToAnchor:settings.leadingAnchor constant:-4],[label.centerYAnchor constraintEqualToAnchor:bar.centerYAnchor],[self.web.topAnchor constraintEqualToAnchor:bar.bottomAnchor],[self.web.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],[self.web.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],[self.web.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor]]];
    [self openLogin];
    if(![NSUserDefaults.standardUserDefaults stringForKey:@"server"])dispatch_async(dispatch_get_main_queue(),^{[self showSettings];});
}
-(BOOL)localURL:(NSURL *)url{return [url.scheme isEqualToString:@"http"]&&[url.host isEqualToString:@"127.0.0.1"]&&url.port.intValue==self.server.port;}
-(void)openLogin{[self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[self.origin stringByAppendingString:@"/login.html"]]]];}
-(void)goBack{if(self.web.canGoBack)[self.web goBack];else [self openLogin];}
-(void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message{
    if(!message.frameInfo.isMainFrame||![self localURL:self.web.URL]||![message.name isEqualToString:@"nativeScan"]||![message.body isEqual:@"scan"])return;
    AVAuthorizationStatus status=[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
    if(status==AVAuthorizationStatusNotDetermined){[AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted){dispatch_async(dispatch_get_main_queue(),^{if(granted)[self showScanner];else [self cameraDenied];});}];}
    else if(status==AVAuthorizationStatusAuthorized)[self showScanner];else [self cameraDenied];
}
-(void)cameraDenied{UIAlertController *a=[UIAlertController alertControllerWithTitle:@"相机权限未开启" message:@"请在 iPhone 设置中允许本应用访问相机；也可以使用页面上的相册识别。" preferredStyle:UIAlertControllerStyleAlert];[a addAction:[UIAlertAction actionWithTitle:@"知道了" style:UIAlertActionStyleCancel handler:nil]];[self presentViewController:a animated:YES completion:nil];}
-(void)showScanner{
    if(self.presentedViewController)return;
    ScannerController *scanner=[ScannerController new];scanner.modalPresentationStyle=UIModalPresentationFullScreen;
    __weak MainController *weak=self;
    scanner.result=^(NSString *text){MainController *owner=weak;if(!owner||![owner localURL:owner.web.URL])return;NSString *js=[NSString stringWithFormat:@"(function(){var t=document.getElementById('qr-text'),b=document.getElementById('read-link');if(t&&b){t.value=%@;b.click();}})();",JSONString(text)];[owner.web evaluateJavaScript:js completionHandler:nil];};
    [self presentViewController:scanner animated:YES completion:nil];
}
-(NSString *)validatedServer:(NSString *)text{
    NSString *value=[text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];NSURLComponents *u=[NSURLComponents componentsWithString:value];
    if(!u.host.length||u.user||u.password||u.query||u.fragment||(u.path.length&&![u.path isEqualToString:@"/"])||(u.port&&(u.port.intValue<1||u.port.intValue>65535)))return nil;
    BOOL https=[u.scheme.lowercaseString isEqualToString:@"https"],private=NO;NSArray *parts=[u.host componentsSeparatedByString:@"."];
    if(parts.count==4){int p[4];BOOL valid=YES;for(int i=0;i<4;i++){NSString *part=parts[i];if(part.length==0||[part rangeOfCharacterFromSet:NSCharacterSet.decimalDigitCharacterSet.invertedSet].location!=NSNotFound){valid=NO;break;}p[i]=part.intValue;if(p[i]>255){valid=NO;break;}}if(valid)private=p[0]==10||(p[0]==192&&p[1]==168)||(p[0]==172&&p[1]>=16&&p[1]<=31);}
    if(!https&&!([u.scheme.lowercaseString isEqualToString:@"http"]&&private))return nil;
    u.path=@"";return u.string;
}
-(void)showSettings{
    if(self.presentedViewController)return;
    NSString *old=[NSUserDefaults.standardUserDefaults stringForKey:@"server"]?:[NSBundle.mainBundle objectForInfoDictionaryKey:@"LaserDefaultServer"];
    UIAlertController *a=[UIAlertController alertControllerWithTitle:@"后端连接设置" message:@"手机与电脑连接同一 Wi-Fi，电脑后端保持运行。只填写你自己的后端根地址。更换地址会退出登录。" preferredStyle:UIAlertControllerStyleAlert];
    [a addTextFieldWithConfigurationHandler:^(UITextField *field){field.text=old;field.keyboardType=UIKeyboardTypeURL;field.autocorrectionType=UITextAutocorrectionTypeNo;field.autocapitalizationType=UITextAutocapitalizationTypeNone;field.placeholder=@"http://192.168.0.100:8180";}];
    [a addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [a addAction:[UIAlertAction actionWithTitle:@"测试连接" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action){NSString *base=[self validatedServer:a.textFields.firstObject.text];if(!base){[self message:@"地址不正确" detail:@"HTTP 仅用于局域网 IP，公网请使用 HTTPS；不要填写网页路径。"] ;return;}[self testServer:base];}]];
    [a addAction:[UIAlertAction actionWithTitle:@"保存并打开" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action){NSString *base=[self validatedServer:a.textFields.firstObject.text];if(!base){[self message:@"地址不正确" detail:@"例如 http://192.168.0.100:8180，只填写服务根地址。"] ;return;}[NSUserDefaults.standardUserDefaults setObject:base forKey:@"server"];if(![base isEqualToString:old]){
        [self.web evaluateJavaScript:@"localStorage.clear();sessionStorage.clear();" completionHandler:^(id value,NSError *error){[WKWebsiteDataStore.defaultDataStore removeDataOfTypes:WKWebsiteDataStore.allWebsiteDataTypes modifiedSince:NSDate.distantPast completionHandler:^{[self openLogin];}];}];
    }else [self openLogin];}]];
    [self presentViewController:a animated:YES completion:nil];
}
-(void)testServer:(NSString *)base{
    [self.connectionTask cancel];NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:[base stringByAppendingString:@"/"]]];request.timeoutInterval=5;
    self.connectionTask=[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){NSInteger status=[response isKindOfClass:NSHTTPURLResponse.class]?((NSHTTPURLResponse *)response).statusCode:0;dispatch_async(dispatch_get_main_queue(),^{[self message:!error&&status==200?@"连接成功":@"连接失败" detail:!error&&status==200?@"返回连接设置，保存该地址后登录。":@"请检查同一 Wi-Fi、后端运行、电脑防火墙，以及 iPhone 设置中的本地网络权限。"] ;});}];[self.connectionTask resume];
}
-(void)message:(NSString *)title detail:(NSString *)detail{if(self.presentedViewController)return;UIAlertController *a=[UIAlertController alertControllerWithTitle:title message:detail preferredStyle:UIAlertControllerStyleAlert];[a addAction:[UIAlertAction actionWithTitle:@"确定" style:UIAlertActionStyleCancel handler:nil]];[self presentViewController:a animated:YES completion:nil];}
-(void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler{
    NSURL *u=action.request.URL;if([self localURL:u]||[u.absoluteString isEqualToString:@"about:blank"]){decisionHandler(WKNavigationActionPolicyAllow);return;}
    decisionHandler(WKNavigationActionPolicyCancel);
    if(!action.targetFrame||action.targetFrame.isMainFrame){NSString *scheme=u.scheme.lowercaseString;if([@[@"http",@"https",@"tel",@"mailto"] containsObject:scheme]){
        UIAlertController *a=[UIAlertController alertControllerWithTitle:@"打开外部链接" message:u.absoluteString preferredStyle:UIAlertControllerStyleAlert];[a addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];[a addAction:[UIAlertAction actionWithTitle:@"继续" style:UIAlertActionStyleDefault handler:^(UIAlertAction *x){[UIApplication.sharedApplication openURL:u options:@{} completionHandler:nil];}]];if(!self.presentedViewController)[self presentViewController:a animated:YES completion:nil];
    }}
}
-(WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)windowFeatures{if(!action.targetFrame)[webView loadRequest:action.request];return nil;}
-(void)dealloc{[_web.configuration.userContentController removeScriptMessageHandlerForName:@"nativeScan"];[_connectionTask cancel];}
@end

@interface AppDelegate : UIResponder<UIApplicationDelegate>
@property(nonatomic,strong)UIWindow *window;
@end
@implementation AppDelegate
-(BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options{
    self.window=[[UIWindow alloc]initWithFrame:UIScreen.mainScreen.bounds];self.window.rootViewController=[MainController new];[self.window makeKeyAndVisible];return YES;
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(AppDelegate.class));}}
