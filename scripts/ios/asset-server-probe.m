// macOS integration probe for the exact AssetServer implementation used in iOS.
// Exercises real HTTP requests against a symlinked bundle path before an IPA is signed.
#import "../../apps/ios-shell/AssetServer.m"

static NSDictionary *Request(int port,NSString *method,NSString *path){
    int client=socket(AF_INET,SOCK_STREAM,0);int one=1;setsockopt(client,SOL_SOCKET,SO_NOSIGPIPE,&one,sizeof(one));
    struct timeval timeout={5,0};setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));
    struct sockaddr_in address={0};address.sin_len=sizeof(address);address.sin_family=AF_INET;address.sin_port=htons(port);address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    if(connect(client,(struct sockaddr *)&address,sizeof(address))<0){close(client);return nil;}
    NSString *request=[NSString stringWithFormat:@"%@ %@ HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nConnection: close\r\n\r\n",method,path,port];
    NSData *bytes=[request dataUsingEncoding:NSUTF8StringEncoding];NSUInteger sent=0;
    while(sent<bytes.length){ssize_t n=send(client,(const char *)bytes.bytes+sent,bytes.length-sent,0);if(n<=0){close(client);return nil;}sent+=n;}
    NSMutableData *response=[NSMutableData data];char buffer[8192];ssize_t n;
    while((n=recv(client,buffer,sizeof(buffer),0))>0)[response appendBytes:buffer length:n];close(client);
    NSData *separator=[@"\r\n\r\n" dataUsingEncoding:NSUTF8StringEncoding];NSRange split=[response rangeOfData:separator options:0 range:NSMakeRange(0,response.length)];
    if(split.location==NSNotFound)return nil;
    NSString *headers=[[NSString alloc]initWithData:[response subdataWithRange:NSMakeRange(0,split.location)] encoding:NSUTF8StringEncoding];
    NSArray *first=[[headers componentsSeparatedByString:@"\r\n"].firstObject componentsSeparatedByString:@" "];
    NSData *body=[response subdataWithRange:NSMakeRange(NSMaxRange(split),response.length-NSMaxRange(split))];
    return @{@"status":@(first.count>1?[first[1] intValue]:0),@"body":body,@"headers":headers};
}
static void Require(BOOL ok,NSString *what){if(!ok){fprintf(stderr,"Native asset-server regression failed: %s\n",what.UTF8String);exit(1);}}
int main(int argc,char **argv){@autoreleasepool{
    Require(argc==2,@"expected real bundled web folder");
    NSFileManager *fm=NSFileManager.defaultManager;NSError *error=nil;
    NSString *source=[[NSString stringWithUTF8String:argv[1]] stringByStandardizingPath];
    NSString *temporary=[NSTemporaryDirectory() stringByAppendingPathComponent:[@"laser-native-probe-" stringByAppendingString:NSUUID.UUID.UUIDString]];
    Require([fm createDirectoryAtPath:temporary withIntermediateDirectories:YES attributes:nil error:&error],@"create private fixture");
    NSString *real=[temporary stringByAppendingPathComponent:@"real-web"];
    Require([fm copyItemAtPath:source toPath:real error:&error],@"copy actual bundled assets");
    NSString *alias=[temporary stringByAppendingPathComponent:@"bundle-alias"];
    Require([fm createSymbolicLinkAtPath:alias withDestinationPath:real error:&error],@"create bundle path alias");
    NSString *outside=[temporary stringByAppendingPathComponent:@"outside"];
    Require([fm createDirectoryAtPath:outside withIntermediateDirectories:YES attributes:nil error:&error],@"create outside fixture");
    [@"must not be served" writeToFile:[outside stringByAppendingPathComponent:@"secret.txt"] atomically:YES encoding:NSUTF8StringEncoding error:&error];
    Require([fm createSymbolicLinkAtPath:[real stringByAppendingPathComponent:@"blocked"] withDestinationPath:outside error:&error],@"create escape regression fixture");
    [[NSUserDefaults standardUserDefaults]setObject:@"http://192.168.0.100:8180" forKey:@"server"];
    __attribute__((objc_precise_lifetime)) AssetServer *server=[AssetServer new];server.root=alias;server.port=0;
    Require([server start:&error],@"start production asset-server implementation");
    NSMutableArray *checks=[NSMutableArray array];
    for(NSString *path in @[@"/",@"/login.html",@"/login.html?test=1",@"/product-design.css",@"/iot/monitor.html",@"/brand/laser-service-mark.svg"]){
        NSDictionary *r=Request(server.port,@"GET",path);Require([r[@"status"]intValue]==200,path);
        NSString *relative=[path isEqualToString:@"/"]?@"login.html":[[[path componentsSeparatedByString:@"?"].firstObject substringFromIndex:1] stringByRemovingPercentEncoding];
        NSData *expected=[NSData dataWithContentsOfFile:[real stringByAppendingPathComponent:relative]];
        Require([r[@"body"]isEqual:expected],[path stringByAppendingString:@" bytes"]);[checks addObject:path];
    }
    NSString *font=nil;for(NSString *name in [fm enumeratorAtPath:real]){if([name.pathExtension isEqualToString:@"woff2"]){font=name;break;}}
    Require(font!=nil,@"bundled icon font exists");NSDictionary *r=Request(server.port,@"GET",[@"/" stringByAppendingString:font]);
    Require([r[@"status"]intValue]==200&&[r[@"body"]isEqual:[NSData dataWithContentsOfFile:[real stringByAppendingPathComponent:font]]],@"font bytes");[checks addObject:@"font bytes"];
    r=Request(server.port,@"GET",@"/app-config.js");NSString *config=[[NSString alloc]initWithData:r[@"body"] encoding:NSUTF8StringEncoding];
    Require([r[@"status"]intValue]==200&&[config hasPrefix:@"window.LASER_API_BASE=\"http://192.168.0.100:8180\""]&&[config containsString:@"window.APP_API_BASE"],@"backend injection");[checks addObject:@"backend injection"];
    r=Request(server.port,@"HEAD",@"/login.html");Require([r[@"status"]intValue]==200&&[r[@"body"]length]==0,@"HEAD response");[checks addObject:@"HEAD"];
    for(NSString *path in @[@"/%2e%2e/secret.txt",@"/blocked/secret.txt",@"/%00login.html",@"/%zz",@"/missing-page.html"]){
        r=Request(server.port,@"GET",path);Require([r[@"status"]intValue]==404,path);[checks addObject:path];
    }
    r=Request(server.port,@"POST",@"/login.html");Require([r[@"status"]intValue]==404,@"POST is not an asset operation");[checks addObject:@"POST rejected"];
    NSDictionary *report=@{@"nativeAssetServer":@"passed",@"symlinkBundlePath":@YES,@"checkCount":@(checks.count),@"checks":checks};
    printf("%s\n",JSONString(report).UTF8String);
    dispatch_source_cancel(server.source);
    [fm removeItemAtPath:temporary error:nil];return 0;
}}
