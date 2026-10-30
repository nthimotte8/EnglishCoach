// Shown wherever the coach is needed but its model is not on the phone yet.
import React from 'react';
import { View } from 'react-native';
import { MODEL } from './llm';
import { useApp } from './store';
import { useColors } from './theme';
import { Button, Card, H, Notice, P } from './ui';

export function ModelGate({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  const c = useColors();
  const { model, downloadModel, cancelDownload } = useApp();
  if (model.installed) return <>{children}</>;
  return (
    <Card>
      <H>Installer le coach</H>
      {!compact && (
        <P muted>
          Le coach est un modèle d’IA qui tourne directement sur ton iPhone : gratuit, sans compte et hors ligne.
          Il faut le télécharger une seule fois (environ 1 Go, de préférence en Wi-Fi).
        </P>
      )}
      {model.progress !== null ? (
        <View style={{ gap: 8 }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.chip }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.accent, width: `${Math.round(model.progress * 100)}%` }} />
          </View>
          <P muted size={13}>Téléchargement… {Math.round(model.progress * 100)} %. Garde l’app ouverte.</P>
          <Button title="Annuler" onPress={cancelDownload} />
        </View>
      ) : (
        <Button variant="primary" title="Télécharger le coach (1 Go)" onPress={downloadModel} />
      )}
      {model.error && <Notice text={model.error} />}
      <P muted size={12}>Modèle : {MODEL.name}, licence Apache-2.0.</P>
    </Card>
  );
}
