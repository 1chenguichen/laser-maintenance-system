#import <Foundation/Foundation.h>
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
-(void)setRoot:(NSString *)root {
    // Foundation may canonicalize /var or /tmp to /private paths. Canonicalize
    // both sides of the boundary check rather than comparing an alias to a real path.
    _root=[[[root stringByStandardizingPath] stringByResolvingSymlinksInPath] copy];
}
-(BOOL)start:(NSError **)error {
    int fd=socket(AF_INET,SOCK_STREAM,0); if(fd<0)return NO;
    int one=1;setsockopt(fd,SOL_SOCKET,SO_REUSEADDR,&one,sizeof(one));
    struct sockaddr_in address={0};address.sin_len=sizeof(address);address.sin_family=AF_INET;
    address.sin_port=htons(self.port);address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    if(bind(fd,(struct sockaddr *)&address,sizeof(address))<0||listen(fd,16)<0){
        if(error)*error=[NSError errorWithDomain:NSPOSIXErrorDomain code:errno userInfo:nil];close(fd);return NO;
    }
    struct sockaddr_in bound={0};socklen_t length=sizeof(bound);
    if(getsockname(fd,(struct sockaddr *)&bound,&length)==0)self.port=ntohs(bound.sin_port);
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
        BOOL allowed=([method isEqualToString:@"GET"]||[method isEqualToString:@"HEAD"])
            &&route.length>0&&[route hasPrefix:@"/"]&&![route containsString:@".."]&&![route containsString:@"\\"]
            &&[route rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location==NSNotFound;
        NSData *body=nil;NSString *mime=@"text/plain";
        if(allowed){
            NSString *file=[[[self.root stringByAppendingPathComponent:[route substringFromIndex:1]] stringByStandardizingPath] stringByResolvingSymlinksInPath];
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
