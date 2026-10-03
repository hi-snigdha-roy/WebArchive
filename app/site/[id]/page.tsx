import { SiteScreen } from '@/components/site-screen';

export default async function SitePage(props: PageProps<'/site/[id]'>) {
  const { id } = await props.params;
  return <SiteScreen siteId={id} />;
}
