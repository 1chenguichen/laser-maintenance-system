import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zhixiugong_engineer/api.dart';
import 'package:zhixiugong_engineer/store.dart';
void main(){
 test('rejects cleartext API roots',(){expect(()=>Api(base:'http://example.com/api'),throwsArgumentError);});
 test('business token and optimistic version are sent, failed writes are not retried',()async{var count=0;final api=Api(client:MockClient((r)async{count++;expect(r.headers['authorization'],'Bearer test');expect(jsonDecode(r.body),{'action':'complete','version':3});return http.Response('{"message":"服务单状态已变化"}',409,headers:{'content-type':'application/json; charset=utf-8'});}));api.token='test';await expectLater(api.call('/market/requests/id/action',method:'POST',body:{'action':'complete','version':3}),throwsA(isA<ApiFailure>().having((e)=>e.status,'status',409)));expect(count,1);api.dispose();});
 test('401 clears authentication through its callback',()async{var expired=false;final api=Api(client:MockClient((_)async=>http.Response('{"message":"expired"}',401)));api.token='test';api.onUnauthorized=()=>expired=true;await expectLater(api.call('/auth/profile'),throwsA(isA<ApiFailure>()));expect(expired,true);api.dispose();});
 test('refresh preserves last good data on network failure and deduplicates requests',()async{var count=0,fail=false;final api=Api(client:MockClient((_)async{count++;await Future<void>.delayed(const Duration(milliseconds:5));if(fail)return http.Response('{"message":"offline"}',503);return http.Response('[{"id":"one","status":"REPAIRING"}]',200);}));final store=EngineerStore(api);await Future.wait([store.load('/engineer/orders'),store.load('/engineer/orders')]);expect(count,1);fail=true;await store.load('/engineer/orders');expect(rows(store.data['/engineer/orders']).single['id'],'one');expect(store.errors['/engineer/orders'],isNotEmpty);store.clear();expect(store.data,isEmpty);store.dispose();api.dispose();});
 test('company and platform workflows do not mix action states',(){expect(const ServiceOrder({'status':'REPAIRING'}).action,'complete');expect(const ServiceOrder({'status':'ACCEPTED'},platform:true).action,'quote');expect(const ServiceOrder({'status':'PENDING_PAYMENT'}).action,isNull);expect(const ServiceOrder({'status':'AWAITING_ACCEPTANCE'},platform:true).action,isNull);});
}
