let reads: any[] = [], paths: string[] = [], home = '/fixture/home';
export function configure(values:any[],root:string){reads=[...values];paths=[];home=root;}
export function observedPaths(){return [...paths];}
export function homedir(){return home;}
export async function readFile(path:string,_encoding:string){
 paths.push(path);const next=reads.shift();
 if(!next||next.error)throw new Error('EACCES synthetic-key-path');
 return next.pem;
}
