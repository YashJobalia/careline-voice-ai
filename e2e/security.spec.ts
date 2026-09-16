import {test,expect} from '@playwright/test';
test('concurrent bookings, signed confirmations, unauthenticated access and ownership',async({playwright})=>{
 test.skip(!process.env.TEST_PASSWORD,'Test fixtures required');
 const baseURL=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
 const a=await playwright.request.newContext({baseURL});const b=await playwright.request.newContext({baseURL});const guest=await playwright.request.newContext({baseURL});
 expect((await guest.get('/api/appointments')).status()).toBe(401);
 await a.post('/api/auth',{data:{action:'signin',email:process.env.TEST_EMAIL,password:process.env.TEST_PASSWORD}});
 await b.post('/api/auth',{data:{action:'signin',email:process.env.TEST_EMAIL_TWO,password:process.env.TEST_PASSWORD}});
 const {slots}=await(await a.get('/api/clinic')).json();const slotId=slots.at(-1).id;
 const pa=await(await a.put('/api/appointments',{data:{slotId,patientName:'Race Test A'}})).json();const pb=await(await b.put('/api/appointments',{data:{slotId,patientName:'Race Test B'}})).json();
 expect((await b.post('/api/appointments',{data:{token:pa.proposal.token}})).status()).toBe(403);
 expect((await a.post('/api/appointments',{data:{token:pa.proposal.token+'tampered'}})).status()).toBe(401);
 const [ra,rb]=await Promise.all([a.post('/api/appointments',{data:{token:pa.proposal.token}}),b.post('/api/appointments',{data:{token:pb.proposal.token}})]);
 expect([ra.status(),rb.status()].sort()).toEqual([201,409]);
 const winner=ra.status()===201?a:b;const saved=await(ra.status()===201?ra:rb).json();expect((await winner.delete('/api/appointments',{data:{id:saved.id}})).status()).toBe(200);
 expect((await a.post('/api/auth',{headers:{Origin:'https://untrusted.example'},data:{action:'signout'}})).status()).toBe(403);
 await Promise.all([a.dispose(),b.dispose(),guest.dispose()]);
});
