"""Fresh-process real-engine smoke with socket connections denied before imports."""
import json,socket
original_connect=socket.socket.connect
calls=[]
def deny_network(self,address):
 calls.append(True)
 raise AssertionError('NETWORK_NOT_ALLOWED')
socket.socket.connect=deny_network
from redact import redact
report=redact('synthetic@example.invalid')
assert report['summary']['detections']==1
assert report['redactedText']=='[REDACTED]'
assert not calls
print(json.dumps({'mode':'fresh-process-network-denied','engine':'presidio-2.2.366','detections':1,'network_attempts':0}))
